/** Shared TTL for the Deutsche Bundesbank yield-curve history cache. */
export const DE_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function isGermanyHistoryCacheFresh(savedAtIsoOrMs: string | number, nowMs = Date.now()): boolean {
  const savedMs = typeof savedAtIsoOrMs === "number" ? savedAtIsoOrMs : Date.parse(savedAtIsoOrMs);
  if (!Number.isFinite(savedMs)) return false;
  const age = nowMs - savedMs;
  return age >= 0 && age < DE_HISTORY_CACHE_TTL_MS;
}
