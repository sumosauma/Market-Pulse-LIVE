import type { FxPoint, FxTimeframe } from "./types";

export function lastTwoPoints(points: readonly FxPoint[]): FxPoint[] {
  if (points.length <= 2) return [...points];
  return points.slice(-2);
}

export function historyChangePct(points: readonly FxPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]!.close;
  const last = points[points.length - 1]!.close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}

/** Frankfurter already returns the requested window; 1D keeps the last two daily fixes. */
export function sliceFxPoints(points: readonly FxPoint[], timeframe: FxTimeframe): FxPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return timeframe === "1D" ? lastTwoPoints(sorted) : sorted;
}
