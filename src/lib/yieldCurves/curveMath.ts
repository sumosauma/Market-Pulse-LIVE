import type { CurveMoveLabel, YieldComparisonId, YieldCurveByMaturity, YieldCurveRowView, YieldMaturity } from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

const SHORT_END: YieldMaturity[] = ["1M", "3M", "6M", "1Y", "2Y"];
const LONG_END: YieldMaturity[] = ["5Y", "10Y", "30Y"];

export function changeBps(currentPct: number, comparisonPct: number): number {
  return (currentPct - comparisonPct) * 100;
}

/** Mock-only symmetric rows (every maturity present). Prefer snapshotToRowViews for live data. */
export function buildYieldCurveRows(
  current: YieldCurveByMaturity,
  comparison: YieldCurveByMaturity,
): YieldCurveRowView[] {
  return YIELD_CURVE_MATURITIES.map((maturity) => {
    const cur = current[maturity];
    const cmp = comparison[maturity];
    const years = YIELD_MATURITY_YEAR_FRACTION[maturity];
    const date = "mock";
    const base = {
      country: "US" as const,
      maturity,
      years,
      source: "Mock (illustrative)",
      sourceType: "external" as const,
      curveType: "par" as const,
    };
    return {
      maturity,
      years,
      currentYield: cur,
      comparisonYield: cmp,
      changeBps: changeBps(cur, cmp),
      current: { ...base, yield: cur, date },
      comparison: { ...base, yield: cmp, date },
    };
  });
}

export function spread2s10s(curve: YieldCurveByMaturity): number | null {
  const a = curve["10Y"];
  const b = curve["2Y"];
  return typeof a === "number" && typeof b === "number" ? a - b : null;
}

export function spread5s30s(curve: YieldCurveByMaturity): number | null {
  const a = curve["30Y"];
  const b = curve["5Y"];
  return typeof a === "number" && typeof b === "number" ? a - b : null;
}

export function spread2s10sFromRows(rows: YieldCurveRowView[]): number | null {
  const y10 = rows.find((r) => r.maturity === "10Y")?.currentYield;
  const y2 = rows.find((r) => r.maturity === "2Y")?.currentYield;
  return typeof y10 === "number" && typeof y2 === "number" ? y10 - y2 : null;
}

export function spread5s30sFromRows(rows: YieldCurveRowView[]): number | null {
  const y30 = rows.find((r) => r.maturity === "30Y")?.currentYield;
  const y5 = rows.find((r) => r.maturity === "5Y")?.currentYield;
  return typeof y30 === "number" && typeof y5 === "number" ? y30 - y5 : null;
}

/** Mean Δ in bps for maturities where both legs exist. */
export function averageCurveMoveBps(rows: YieldCurveRowView[]): number | null {
  const deltas = rows.map((r) => r.changeBps).filter((x): x is number => x !== null);
  if (!deltas.length) return null;
  return deltas.reduce((a, n) => a + n, 0) / deltas.length;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function meanChangeForMaturities(rows: YieldCurveRowView[], keys: YieldMaturity[]): number | null {
  const deltas = rows
    .filter((r) => keys.includes(r.maturity) && r.changeBps !== null)
    .map((r) => r.changeBps!);
  if (!deltas.length) return null;
  return mean(deltas);
}

export function avgShortEndChangeBps(rows: YieldCurveRowView[]): number | null {
  const vals = SHORT_END.map((m) => rows.find((r) => r.maturity === m)?.changeBps).filter(
    (x): x is number => x !== null,
  );
  if (!vals.length) return null;
  return mean(vals);
}

export function avgLongEndChangeBps(rows: YieldCurveRowView[]): number | null {
  const vals = LONG_END.map((m) => rows.find((r) => r.maturity === m)?.changeBps).filter(
    (x): x is number => x !== null,
  );
  if (!vals.length) return null;
  return mean(vals);
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(v);
}

/**
 * Rule-based interpretation of how the curve moved vs the selected comparison.
 */
export function classifyCurveMove(rows: YieldCurveRowView[]): CurveMoveLabel {
  const changes = rows.map((r) => r.changeBps).filter((x): x is number => x !== null);
  if (changes.length < 2) return "Mixed move";

  const meanCh = mean(changes);
  const shortCh = meanChangeForMaturities(rows, SHORT_END);
  const longCh = meanChangeForMaturities(rows, LONG_END);
  if (shortCh === null || longCh === null) return "Mixed move";
  const spreadLongShort = longCh - shortCh;
  const st = stdDev(changes);
  const range = Math.max(...changes) - Math.min(...changes);

  const mostlyUp = meanCh > 0.75;
  const mostlyDown = meanCh < -0.75;
  const parallel = st < 1.35 && range < 4.5 && Math.abs(meanCh) > 0.15;

  if (parallel) return "Parallel shift";

  if (mostlyUp && spreadLongShort > 1.25) return "Bear steepening";
  if (mostlyUp && spreadLongShort < -1.25) return "Bear flattening";

  if (mostlyDown && spreadLongShort < -1.25) return "Bull steepening";
  if (mostlyDown && spreadLongShort > 1.25) return "Bull flattening";

  return "Mixed move";
}

export function comparisonLabel(id: YieldComparisonId): string {
  const map: Record<YieldComparisonId, string> = {
    Today: "vs prior Treasury publication",
    "1D": "vs 1D",
    "1W": "vs 1W",
    "1M": "vs 1M",
    "3M": "vs 3M",
    "1Y": "vs 1Y",
  };
  return map[id];
}
