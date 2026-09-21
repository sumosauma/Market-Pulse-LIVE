import {
  fetchDiInstrumentHistory,
  normalizeDiPointsToDailyEod,
  trimRowsToLookback,
  type DiObservationRow,
} from "@/lib/di/diInstrumentHistory";
import { getMaturityCoverage } from "./sovereignCountries";
import {
  nearestObservationOnOrBefore,
  pickPriorSessionDate,
  resolveComparisonTargetDate,
} from "./curveComparison";
import { fetchRiksbankSeriesObservationsSafe, sleepMs } from "./riksbankSwea";
import type {
  ParsedSwedenRiksbankHistory,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

/** Enough daily history for 1Y calendar comparison (+ buffer). */
const MAX_HISTORY_LOOKBACK_DAYS = 420;
const SWEA_SERIES_FETCH_GAP_MS = 2000;

/** DI / Millistream government bonds. 10Y first (anchor). 1M/3M/6M come from SWEA. */
export const SWEDEN_DI_SERIES: readonly { maturity: YieldMaturity; insref: string }[] = [
  { maturity: "10Y", insref: "33383" },
  { maturity: "2Y", insref: "33381" },
  { maturity: "5Y", insref: "33382" },
  { maturity: "30Y", insref: "33399" },
];

/** Official Riksbank SWEA treasury bills on the front end of the curve. */
export const SWEDEN_SWEA_BILL_SERIES: readonly { maturity: YieldMaturity; seriesId: string }[] = [
  { maturity: "1M", seriesId: "SETB1MBENCHC" },
  { maturity: "3M", seriesId: "SETB3MBENCH" },
  { maturity: "6M", seriesId: "SETB6MBENCH" },
];

/** 12M T-bill series is closed; not on the harmonized official grid. */
export const STRUCTURALLY_MISSING_SE: readonly YieldMaturity[] = ["1Y"];

const ANCHOR_MATURITY: YieldMaturity = "10Y";
const SNAPSHOT_SOURCE = "Millistream/DI" as const;

function calendarFromRows(rows: readonly DiObservationRow[]): string[] {
  return rows.map((r) => r.date);
}

export async function fetchSwedenDiHistory(): Promise<ParsedSwedenRiksbankHistory> {
  const series: Array<{
    maturity: YieldMaturity;
    seriesId: string;
    rows: DiObservationRow[];
  }> = [];
  const failedMaturities: YieldMaturity[] = [];

  const outcomes = await Promise.all(
    SWEDEN_DI_SERIES.map(async ({ maturity, insref }) => {
      try {
        const hist = await fetchDiInstrumentHistory(insref);
        const rows = trimRowsToLookback(
          normalizeDiPointsToDailyEod(hist.points),
          MAX_HISTORY_LOOKBACK_DAYS,
        );
        if (!rows.length) throw new Error("empty after normalize");
        return { ok: true as const, maturity, insref, rows };
      } catch {
        return { ok: false as const, maturity, insref };
      }
    }),
  );

  for (const o of outcomes) {
    if (o.ok) {
      series.push({ maturity: o.maturity, seriesId: o.insref, rows: o.rows });
    } else {
      failedMaturities.push(o.maturity);
    }
  }

  if (!series.length) {
    throw new Error("All DI Swedish rate history requests failed");
  }

  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - MAX_HISTORY_LOOKBACK_DAYS);
  const start = startDate.toISOString().slice(0, 10);

  for (let i = 0; i < SWEDEN_SWEA_BILL_SERIES.length; i++) {
    if (i > 0) await sleepMs(SWEA_SERIES_FETCH_GAP_MS);
    const { maturity, seriesId } = SWEDEN_SWEA_BILL_SERIES[i]!;
    const result = await fetchRiksbankSeriesObservationsSafe(seriesId, start, end);
    if (result.ok) {
      series.push({
        maturity,
        seriesId,
        rows: trimRowsToLookback(result.rows, MAX_HISTORY_LOOKBACK_DAYS),
      });
    } else {
      failedMaturities.push(maturity);
    }
  }

  return { fetchedAt: new Date().toISOString(), series, failedMaturities };
}

export function buildSwedenDiYieldSnapshot(
  history: ParsedSwedenRiksbankHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  const seriesByMaturity = new Map<YieldMaturity, readonly DiObservationRow[]>();
  for (const s of history.series) {
    seriesByMaturity.set(s.maturity, s.rows);
  }

  const anchorRows = seriesByMaturity.get(ANCHOR_MATURITY);
  if (!anchorRows?.length) return null;

  const anchorCalendar = calendarFromRows(anchorRows);
  const latestDate = anchorRows[anchorRows.length - 1]!.date;
  const { target: comparisonTarget } = resolveComparisonTargetDate(
    latestDate,
    comparisonId,
    anchorCalendar,
  );

  const anchorCmpObs =
    comparisonId === "Today"
      ? (() => {
          const priorDate = pickPriorSessionDate(anchorCalendar, latestDate);
          return priorDate ? nearestObservationOnOrBefore(anchorRows, priorDate) : null;
        })()
      : comparisonTarget && comparisonTarget !== "prior-session"
        ? nearestObservationOnOrBefore(anchorRows, comparisonTarget)
        : null;

  const comparisonDateResolved =
    anchorCmpObs?.date ??
    (comparisonTarget !== "prior-session" ? comparisonTarget : pickPriorSessionDate(anchorCalendar, latestDate) ?? "");

  const failedSet = new Set(history.failedMaturities ?? []);
  const unavailableMaturities = [...failedSet] as YieldMaturity[];

  const points = YIELD_CURVE_MATURITIES.map((maturity) => {
    const coverage = getMaturityCoverage("SE", maturity);
    if (coverage === "missing") {
      return {
        maturity,
        years: YIELD_MATURITY_YEAR_FRACTION[maturity],
        currentYield: null,
        comparisonYield: null,
        changeBps: null,
      };
    }

    const rows = seriesByMaturity.get(maturity);
    if (!rows?.length) {
      return {
        maturity,
        years: YIELD_MATURITY_YEAR_FRACTION[maturity],
        currentYield: null,
        comparisonYield: null,
        changeBps: null,
      };
    }

    const currentObs = rows[rows.length - 1] ?? null;

    let cmpObs: DiObservationRow | null = null;
    if (comparisonId === "Today") {
      // Bills are T+1 vs DI same-day; compare vs each series' own last print.
      const seriesLatest = currentObs?.date ?? latestDate;
      const priorDate = pickPriorSessionDate(calendarFromRows(rows), seriesLatest);
      cmpObs = priorDate ? nearestObservationOnOrBefore(rows, priorDate) : null;
    } else if (comparisonTarget && comparisonTarget !== "prior-session") {
      cmpObs = nearestObservationOnOrBefore(rows, comparisonTarget);
    }

    const cu = currentObs?.value ?? null;
    const co = cmpObs?.value ?? null;
    const changeBps = cu !== null && co !== null ? (cu - co) * 100 : null;

    return {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield: cu,
      comparisonYield: co,
      changeBps,
    };
  });

  return {
    countryId: "SE",
    country: "Sweden",
    date: latestDate,
    comparisonDate: comparisonDateResolved,
    source: SNAPSHOT_SOURCE,
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}

export { snapshotToRowViews } from "./rowViews";

/** @deprecated Use fetchSwedenDiHistory */
export const fetchSwedenRiksbankHistory = fetchSwedenDiHistory;

/** @deprecated Use buildSwedenDiYieldSnapshot */
export const buildSwedenRiksbankYieldSnapshot = buildSwedenDiYieldSnapshot;

/** @deprecated Use SWEDEN_DI_SERIES */
export const SWEDEN_RIKSBANK_SERIES = SWEDEN_DI_SERIES;
