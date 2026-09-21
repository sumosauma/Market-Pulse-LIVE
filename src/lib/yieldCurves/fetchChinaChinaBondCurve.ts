import { getMaturityCoverage } from "./sovereignCountries";
import {
  CHINABOND_HARMONIZED_FIELDS,
  chinaBondRowsToSeries,
  fetchChinaBondHistoryRows,
  type ChinaBondObservationRow,
} from "./chinabondApi";
import {
  nearestObservationOnOrBefore,
  pickPriorSessionDate,
  resolveComparisonTargetDate,
} from "./curveComparison";
import type {
  ParsedChinaChinaBondHistory,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

export const STRUCTURALLY_MISSING_CN: readonly YieldMaturity[] = ["1M"];

const MAX_HISTORY_LOOKBACK_DAYS = 420;
const ANCHOR_MATURITY: YieldMaturity = "10Y";

function calendarFromRows(rows: readonly ChinaBondObservationRow[]): string[] {
  return rows.map((r) => r.date);
}

export async function fetchChinaChinaBondHistory(): Promise<ParsedChinaChinaBondHistory> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - MAX_HISTORY_LOOKBACK_DAYS);
  const start = startDate.toISOString().slice(0, 10);

  const rows = await fetchChinaBondHistoryRows(start, end);
  if (!rows.length) {
    throw new Error("ChinaBond historyQuery returned no observations");
  }

  const seriesMap = chinaBondRowsToSeries(rows);
  const failedMaturities: YieldMaturity[] = [];
  const series: ParsedChinaChinaBondHistory["series"][number][] = [];

  for (const { maturity } of CHINABOND_HARMONIZED_FIELDS) {
    const maturityRows = seriesMap.get(maturity);
    if (maturityRows?.length) {
      series.push({ maturity, rows: maturityRows });
    } else if (!STRUCTURALLY_MISSING_CN.includes(maturity)) {
      failedMaturities.push(maturity);
    }
  }

  if (!series.length) {
    throw new Error("No ChinaBond harmonized maturities parsed from official history");
  }

  return {
    fetchedAt: new Date().toISOString(),
    sourceEndpoint: "https://yield.chinabond.com.cn/cbweb-czb-web/czb/historyQuery",
    series,
    failedMaturities: failedMaturities.length ? failedMaturities : undefined,
  };
}

export function buildChinaChinaBondYieldSnapshot(
  history: ParsedChinaChinaBondHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  const seriesByMaturity = new Map<YieldMaturity, readonly ChinaBondObservationRow[]>();
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
    const coverage = getMaturityCoverage("CN", maturity);
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

    let cmpObs: ChinaBondObservationRow | null = null;
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
    countryId: "CN",
    country: "China",
    date: latestDate,
    comparisonDate: comparisonDateResolved,
    source: "ChinaBond / CCDC",
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}

export { snapshotToRowViews } from "./rowViews";
