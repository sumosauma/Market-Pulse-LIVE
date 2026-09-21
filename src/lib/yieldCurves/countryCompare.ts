import type { YieldComparisonId, YieldCurveCountryCompareRow, YieldCurveRowView } from "./types";
import { YIELD_CURVE_MATURITIES } from "./types";

function yieldForPeriod(
  row: YieldCurveRowView | undefined,
  comparisonId: YieldComparisonId,
): number | null {
  if (!row) return null;
  return comparisonId === "Today" ? row.currentYield : row.comparisonYield;
}

function sourceTypeForPeriod(
  row: YieldCurveRowView | undefined,
  comparisonId: YieldComparisonId,
): YieldCurveCountryCompareRow["primarySourceType"] {
  if (!row) return "missing";
  const pt = comparisonId === "Today" ? row.current : row.comparison;
  return pt.sourceType;
}

/** Align two sovereign curves on the harmonized grid for country comparison. */
export function buildCountryCompareRows(
  primaryRows: YieldCurveRowView[],
  compareRows: YieldCurveRowView[],
  comparisonId: YieldComparisonId = "Today",
): YieldCurveCountryCompareRow[] {
  return YIELD_CURVE_MATURITIES.map((maturity) => {
    const primary = primaryRows.find((r) => r.maturity === maturity);
    const compare = compareRows.find((r) => r.maturity === maturity);
    const primaryYield = yieldForPeriod(primary, comparisonId);
    const compareYield = yieldForPeriod(compare, comparisonId);
    const spreadBps =
      primaryYield !== null && compareYield !== null ? (primaryYield - compareYield) * 100 : null;

    return {
      maturity,
      primaryYield,
      compareYield,
      spreadBps,
      primarySourceType: sourceTypeForPeriod(primary, comparisonId),
      compareSourceType: sourceTypeForPeriod(compare, comparisonId),
    };
  });
}
