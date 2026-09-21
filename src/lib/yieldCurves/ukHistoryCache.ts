/** Shared TTL + freshness helpers for UK Bank of England yield-curve history caches. */

export const UK_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function isUkHistoryCacheFresh(savedAtIsoOrMs: string | number, nowMs = Date.now()): boolean {
  const savedMs = typeof savedAtIsoOrMs === "number" ? savedAtIsoOrMs : Date.parse(savedAtIsoOrMs);
  if (!Number.isFinite(savedMs)) return false;
  const age = nowMs - savedMs;
  return age >= 0 && age < UK_HISTORY_CACHE_TTL_MS;
}
