import { getMaturityCoverage } from "./sovereignCountries";
import {
  fetchNorgesBankSeriesObservationsSafe,
  sleepMs,
  type NorgesBankObservationRow,
} from "./norgesBankSdmx";
import {
  nearestObservationOnOrBefore,
  pickPriorSessionDate,
  resolveComparisonTargetDate,
} from "./curveComparison";
import type {
  NorwayNorgesBankProduct,
  ParsedNorwayNorgesBankHistory,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

export const STRUCTURALLY_MISSING_NO: readonly YieldMaturity[] = ["1M", "30Y"];

const MAX_HISTORY_LOOKBACK_DAYS = 420;
const SERIES_FETCH_GAP_MS = 1200;
const ANCHOR_MATURITY: YieldMaturity = "10Y";

/** Official Norges Bank series on harmonized grid. 10Y first (anchor). */
export const NORWAY_NORGES_BANK_SERIES: readonly {
  maturity: YieldMaturity;
  datasetId: string;
  seriesKey: string;
  product: NorwayNorgesBankProduct;
}[] = [
  { maturity: "10Y", datasetId: "GOVT_GENERIC_RATES", seriesKey: "B.10Y.GBON", product: "generic" },
  { maturity: "3M", datasetId: "GOVT_GENERIC_RATES", seriesKey: "B.3M.TBIL", product: "generic" },
  { maturity: "6M", datasetId: "GOVT_GENERIC_RATES", seriesKey: "B.6M.TBIL", product: "generic" },
  { maturity: "1Y", datasetId: "GOVT_GENERIC_RATES", seriesKey: "B.12M.TBIL", product: "generic" },
  { maturity: "5Y", datasetId: "GOVT_GENERIC_RATES", seriesKey: "B.5Y.GBON", product: "generic" },
  { maturity: "2Y", datasetId: "GOVT_ZEROCOUPON", seriesKey: "B.2Y", product: "zeroCoupon" },
];

function calendarFromRows(rows: readonly NorgesBankObservationRow[]): string[] {
  return rows.map((r) => r.date);
}

export async function fetchNorwayNorgesBankHistory(): Promise<ParsedNorwayNorgesBankHistory> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - MAX_HISTORY_LOOKBACK_DAYS);
  const start = startDate.toISOString().slice(0, 10);

  const series: ParsedNorwayNorgesBankHistory["series"][number][] = [];
  const failedMaturities: YieldMaturity[] = [];

  for (let i = 0; i < NORWAY_NORGES_BANK_SERIES.length; i++) {
    const { maturity, datasetId, seriesKey, product } = NORWAY_NORGES_BANK_SERIES[i]!;
    if (i > 0) await sleepMs(SERIES_FETCH_GAP_MS);

    const result = await fetchNorgesBankSeriesObservationsSafe(datasetId, seriesKey, start, end);
    if (result.ok) {
      series.push({ maturity, datasetId, seriesKey, product, rows: result.rows });
    } else {
      failedMaturities.push(maturity);
    }
  }

  if (!series.length) {
    throw new Error("All Norges Bank series requests failed (network or API error)");
  }

  return { fetchedAt: new Date().toISOString(), series, failedMaturities };
}

export function buildNorwayNorgesBankYieldSnapshot(
  history: ParsedNorwayNorgesBankHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  const seriesByMaturity = new Map<YieldMaturity, readonly NorgesBankObservationRow[]>();
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

  const unavailableMaturities = [...(history.failedMaturities ?? [])] as YieldMaturity[];

  const points = YIELD_CURVE_MATURITIES.map((maturity) => {
    const coverage = getMaturityCoverage("NO", maturity);
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

    let cmpObs: NorgesBankObservationRow | null = null;
    if (comparisonId === "Today") {
      const priorDate = pickPriorSessionDate(calendarFromRows(rows), latestDate);
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
    countryId: "NO",
    country: "Norway",
    date: latestDate,
    comparisonDate: comparisonDateResolved,
    source: "Norges Bank",
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}

export { snapshotToRowViews } from "./rowViews";
