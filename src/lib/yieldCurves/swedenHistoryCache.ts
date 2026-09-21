/** Shared TTL + freshness helpers for Sweden DI yield-curve history caches. */

/** Reuse cached history for 12h — avoids repeated SWEA bursts on comparison toggles. */
export const SE_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function isSwedenHistoryCacheFresh(savedAtIsoOrMs: string | number, nowMs = Date.now()): boolean {
  const savedMs = typeof savedAtIsoOrMs === "number" ? savedAtIsoOrMs : Date.parse(savedAtIsoOrMs);
  if (!Number.isFinite(savedMs)) return false;
  const age = nowMs - savedMs;
  return age >= 0 && age < SE_HISTORY_CACHE_TTL_MS;
}
