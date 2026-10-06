import { getMaturityCoverage } from "./sovereignCountries";
import {
  nearestObservationOnOrBefore,
  pickPriorSessionDate,
  resolveComparisonTargetDate,
} from "./curveComparison";
import type {
  SovereignCountryId,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

type HistoryRow = { date: string; value: number };

export type OfficialHistorySeries = Readonly<{
  maturity: YieldMaturity;
  rows: readonly HistoryRow[];
}>;

/** Current leg must land on the anchor session. Older prints are not shown as today. */
function currentOnAnchor(rows: readonly HistoryRow[], latestDate: string): number | null {
  const obs = nearestObservationOnOrBefore(rows, latestDate);
  return obs?.date === latestDate ? obs.value : null;
}

/**
 * Shared official-history snapshot. Comparison dates use the existing
 * calendar targets and the nearest observation on or before that date.
 * Missing rows stay null — they are never stored as 0%.
 */
export function buildOfficialHistorySnapshot(args: {
  countryId: SovereignCountryId;
  country: string;
  source: YieldCurveSnapshot["source"];
  series: readonly OfficialHistorySeries[];
  failedMaturities?: readonly YieldMaturity[];
  comparisonId: YieldComparisonId;
  updatedAtIso: string;
}): YieldCurveSnapshot | null {
  const seriesByMaturity = new Map<YieldMaturity, readonly HistoryRow[]>();
  for (const s of args.series) seriesByMaturity.set(s.maturity, s.rows);

  const anchorRows = seriesByMaturity.get("10Y");
  if (!anchorRows?.length) return null;

  const anchorCalendar = anchorRows.map((r) => r.date);
  const latestDate = anchorRows[anchorRows.length - 1]!.date;
  const { target: comparisonTarget } = resolveComparisonTargetDate(
    latestDate,
    args.comparisonId,
    anchorCalendar,
  );

  const priorSession = pickPriorSessionDate(anchorCalendar, latestDate);
  const anchorCmp =
    args.comparisonId === "Today"
      ? priorSession
        ? nearestObservationOnOrBefore(anchorRows, priorSession)
        : null
      : comparisonTarget && comparisonTarget !== "prior-session"
        ? nearestObservationOnOrBefore(anchorRows, comparisonTarget)
        : null;

  const comparisonDateResolved =
    anchorCmp?.date ??
    (comparisonTarget !== "prior-session" ? comparisonTarget : priorSession ?? "");

  const unavailable = new Set<YieldMaturity>(args.failedMaturities ?? []);

  const points = YIELD_CURVE_MATURITIES.map((maturity) => {
    const empty = {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield: null,
      comparisonYield: null,
      changeBps: null,
    };
    if (getMaturityCoverage(args.countryId, maturity) === "missing") return empty;

    const rows = seriesByMaturity.get(maturity);
    if (!rows?.length) {
      unavailable.add(maturity);
      return empty;
    }

    const currentYield = currentOnAnchor(rows, latestDate);
    if (currentYield == null) unavailable.add(maturity);

    let cmpObs: HistoryRow | null = null;
    if (args.comparisonId === "Today") {
      cmpObs = priorSession ? nearestObservationOnOrBefore(rows, priorSession) : null;
    } else if (comparisonTarget && comparisonTarget !== "prior-session") {
      cmpObs = nearestObservationOnOrBefore(rows, comparisonTarget);
    }

    const comparisonYield = cmpObs?.value ?? null;
    const changeBps =
      currentYield != null && comparisonYield != null ? (currentYield - comparisonYield) * 100 : null;

    return {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield,
      comparisonYield,
      changeBps,
    };
  });

  return {
    countryId: args.countryId,
    country: args.country,
    date: latestDate,
    comparisonDate: comparisonDateResolved,
    source: args.source,
    updatedAt: args.updatedAtIso,
    points,
    unavailableMaturities: unavailable.size ? [...unavailable] : undefined,
  };
}
