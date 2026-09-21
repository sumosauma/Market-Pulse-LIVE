import type { YieldComparisonId, YieldCurveRowView } from "./types";

export const RISK_SIGNAL_NOT_ENOUGH = "Not enough data";

function maturityYield(
  rows: readonly YieldCurveRowView[],
  maturity: "2Y" | "10Y",
  leg: "current" | "comparison",
): number | null {
  const row = rows.find((r) => r.maturity === maturity);
  if (!row) return null;
  const pt = leg === "current" ? row.current : row.comparison;
  if (pt.sourceType === "missing" || pt.sourceType === "unavailable") return null;
  const y = leg === "current" ? row.currentYield : row.comparisonYield;
  return y !== null && Number.isFinite(y) ? y : null;
}

/** 2Y–10Y spread = (10Y − 2Y) × 100 basis points. */
export function riskSignalBps(y10: number, y2: number): number {
  return (y10 - y2) * 100;
}

export function riskSignalFromRows(
  rows: readonly YieldCurveRowView[],
): { bps: number | null; insufficient: boolean } {
  const y2 = maturityYield(rows, "2Y", "current");
  const y10 = maturityYield(rows, "10Y", "current");
  if (y2 === null || y10 === null) return { bps: null, insufficient: true };
  return { bps: riskSignalBps(y10, y2), insufficient: false };
}

/** Risk signal at current levels or at a historical comparison period. */
export function riskSignalAtPeriod(
  rows: readonly YieldCurveRowView[],
  comparisonId: YieldComparisonId,
): { bps: number | null; insufficient: boolean } {
  if (comparisonId === "Today") return riskSignalFromRows(rows);
  const bps = riskSignalComparisonFromRows(rows, comparisonId);
  return { bps, insufficient: bps === null };
}

/** Change in 2Y–10Y spread vs selected comparison period (null when period is Today). */
export function riskSignalChangeFromRows(
  rows: readonly YieldCurveRowView[],
  comparisonId: YieldComparisonId,
): number | null {
  if (comparisonId === "Today") return null;

  const y2c = maturityYield(rows, "2Y", "current");
  const y10c = maturityYield(rows, "10Y", "current");
  const y2p = maturityYield(rows, "2Y", "comparison");
  const y10p = maturityYield(rows, "10Y", "comparison");
  if (y2c === null || y10c === null || y2p === null || y10p === null) return null;

  return riskSignalBps(y10c, y2c) - riskSignalBps(y10p, y2p);
}

/** Comparison-period Risk Signal from row comparison yields (null when Today or legs missing). */
export function riskSignalComparisonFromRows(
  rows: readonly YieldCurveRowView[],
  comparisonId: YieldComparisonId,
): number | null {
  if (comparisonId === "Today") return null;

  const y2 = maturityYield(rows, "2Y", "comparison");
  const y10 = maturityYield(rows, "10Y", "comparison");
  if (y2 === null || y10 === null) return null;

  return riskSignalBps(y10, y2);
}

export function comparisonPeriodAgoLabel(id: YieldComparisonId): string {
  if (id === "Today") return "Today";
  return `${id} ago`;
}

/** e.g. Steepened by +12 bps / Flattened by +8 bps / Unchanged */
export function riskSignalChangeLine(changeBps: number): string {
  if (Math.abs(changeBps) < 0.5) return "Unchanged";
  const magnitude = fmtRiskBps(Math.abs(changeBps));
  return changeBps > 0 ? `Steepened by ${magnitude}` : `Flattened by ${magnitude}`;
}

export function fmtRiskBps(bps: number | null, decimals = 0): string {
  if (bps === null) return "—";
  const sign = bps >= 0 ? "+" : "";
  return `${sign}${bps.toFixed(decimals)} bps`;
}

export function fmtYieldPct(y: number | null): string {
  return y === null ? "—" : `${y.toFixed(2)}%`;
}

/** Short label for summary card lines (e.g. US, Sweden). */
export function shortCountryLabel(countryId: string, fullLabel: string): string {
  if (countryId === "US") return "US";
  if (countryId === "GB") return "UK";
  if (countryId === "CN") return "China";
  if (countryId === "SE") return "Sweden";
  if (countryId === "NO") return "Norway";
  return fullLabel;
}

export function curveRiskDiffLine(
  primaryBps: number | null,
  compareBps: number | null,
  primaryLabel: string,
  compareLabel: string,
): string {
  if (primaryBps === null || compareBps === null) return RISK_SIGNAL_NOT_ENOUGH;
  const diff = primaryBps - compareBps;
  if (Math.abs(diff) < 0.5) return `${primaryLabel} and ${compareLabel} similar`;
  const steeper = diff > 0 ? primaryLabel : compareLabel;
  return `${steeper} steeper by ${fmtRiskBps(Math.abs(diff))}`;
}

export type MarketRegimeLabel =
  | "Little changed"
  | "Bear steepening"
  | "Bull steepening"
  | "Bear flattening"
  | "Bull flattening";

export type MarketRegimeView =
  | { state: "pick-period" }
  | { state: "insufficient" }
  | {
      state: "ready";
      regime: MarketRegimeLabel;
      move2yBps: number;
      move10yBps: number;
      slopeMoveBps: number;
    };

const REGIME_MOVE_SMALL_BPS = 2;

function yieldMoveBps(current: number, comparison: number): number {
  return (current - comparison) * 100;
}

/** Market regime from 2Y / 10Y moves vs selected comparison period. */
export function marketRegimeFromRows(
  rows: readonly YieldCurveRowView[],
  comparisonId: YieldComparisonId,
): MarketRegimeView {
  if (comparisonId === "Today") return { state: "pick-period" };

  const y2c = maturityYield(rows, "2Y", "current");
  const y10c = maturityYield(rows, "10Y", "current");
  const y2p = maturityYield(rows, "2Y", "comparison");
  const y10p = maturityYield(rows, "10Y", "comparison");
  if (y2c === null || y10c === null || y2p === null || y10p === null) {
    return { state: "insufficient" };
  }

  const move2yBps = yieldMoveBps(y2c, y2p);
  const move10yBps = yieldMoveBps(y10c, y10p);
  const slopeMoveBps = riskSignalBps(y10c, y2c) - riskSignalBps(y10p, y2p);
  const avgMove = (move2yBps + move10yBps) / 2;

  const movesSmall =
    Math.abs(move2yBps) < REGIME_MOVE_SMALL_BPS &&
    Math.abs(move10yBps) < REGIME_MOVE_SMALL_BPS &&
    Math.abs(slopeMoveBps) < REGIME_MOVE_SMALL_BPS;

  if (movesSmall) {
    return { state: "ready", regime: "Little changed", move2yBps, move10yBps, slopeMoveBps };
  }

  let regime: MarketRegimeLabel;
  if (avgMove > 0 && slopeMoveBps > 0) regime = "Bear steepening";
  else if (avgMove < 0 && slopeMoveBps > 0) regime = "Bull steepening";
  else if (avgMove > 0 && slopeMoveBps < 0) regime = "Bear flattening";
  else if (avgMove < 0 && slopeMoveBps < 0) regime = "Bull flattening";
  else regime = "Little changed";

  return { state: "ready", regime, move2yBps, move10yBps, slopeMoveBps };
}

export function marketRegimeMoveDetail(move2yBps: number, move10yBps: number): string {
  return `2Y ${fmtRiskBps(move2yBps)} · 10Y ${fmtRiskBps(move10yBps)}`;
}

const MARKET_REGIME_EXPLANATIONS: Record<MarketRegimeLabel, string> = {
  "Bear steepening": "Yields rose and the curve got steeper.",
  "Bull steepening": "Yields fell and the curve got steeper.",
  "Bear flattening": "Yields rose and the curve got flatter.",
  "Bull flattening": "Yields fell and the curve got flatter.",
  "Little changed": "2Y and 10Y were broadly stable.",
};

export function marketRegimeExplanation(regime: MarketRegimeLabel): string {
  return MARKET_REGIME_EXPLANATIONS[regime];
}

export const RELATIVE_REGIME_EXPLANATION =
  "A steeper 2Y–10Y spread means a wider gap between long- and short-term yields.";

export type RelativeRegimeView =
  | { state: "insufficient" }
  | {
      state: "ready";
      steeperLine: string;
      slopeGapBps: number;
      gap2yBps: number;
      gap10yBps: number;
    };

/** Relative steepness between two sovereign curves (country comparison). */
export function relativeRegimeFromRows(
  primaryRows: readonly YieldCurveRowView[],
  compareRows: readonly YieldCurveRowView[],
  primaryShort: string,
  compareShort: string,
  comparisonId: YieldComparisonId = "Today",
): RelativeRegimeView {
  const leg = comparisonId === "Today" ? "current" : "comparison";
  const p2 = maturityYield(primaryRows, "2Y", leg);
  const p10 = maturityYield(primaryRows, "10Y", leg);
  const c2 = maturityYield(compareRows, "2Y", leg);
  const c10 = maturityYield(compareRows, "10Y", leg);
  if (p2 === null || p10 === null || c2 === null || c10 === null) {
    return { state: "insufficient" };
  }

  const slopeGapBps = riskSignalBps(p10, p2) - riskSignalBps(c10, c2);
  const gap2yBps = yieldMoveBps(p2, c2);
  const gap10yBps = yieldMoveBps(p10, c10);

  let steeperLine: string;
  if (Math.abs(slopeGapBps) < 0.5) steeperLine = "Curves are similarly steep";
  else if (slopeGapBps > 0) steeperLine = `${primaryShort} curve is steeper`;
  else steeperLine = `${compareShort} curve is steeper`;

  return { state: "ready", steeperLine, slopeGapBps, gap2yBps, gap10yBps };
}

export function relativeRegimeGapDetail(gap10yBps: number, gap2yBps: number): string {
  return `10Y gap ${fmtRiskBps(gap10yBps)} · 2Y gap ${fmtRiskBps(gap2yBps)}`;
}
