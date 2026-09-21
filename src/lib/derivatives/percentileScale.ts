/** Visual 0–100 marker position. Does not rank or recalculate percentiles. */

export function percentileMarkerPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
