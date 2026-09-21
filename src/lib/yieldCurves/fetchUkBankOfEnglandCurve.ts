import { getMaturityCoverage } from "./sovereignCountries";
import {
  nearestObservationOnOrBefore,
  pickPriorSessionDate,
  resolveComparisonTargetDate,
} from "./curveComparison";
import type {
  ParsedUkBankOfEnglandHistory,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

export const STRUCTURALLY_MISSING_GB: readonly YieldMaturity[] = ["30Y"];

const ANCHOR_MATURITY: YieldMaturity = "10Y";

type BoeObservationRow = Readonly<{ date: string; value: number }>;

function calendarFromRows(rows: readonly BoeObservationRow[]): string[] {
  return rows.map((r) => r.date);
}

export function buildUkBankOfEnglandYieldSnapshot(
  history: ParsedUkBankOfEnglandHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  const seriesByMaturity = new Map<YieldMaturity, readonly BoeObservationRow[]>();
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
    const coverage = getMaturityCoverage("GB", maturity);
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

    let cmpObs: BoeObservationRow | null = null;
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
    countryId: "GB",
    country: "United Kingdom",
    date: latestDate,
    comparisonDate: comparisonDateResolved,
    source: "Bank of England",
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}

export { snapshotToRowViews } from "./rowViews";
