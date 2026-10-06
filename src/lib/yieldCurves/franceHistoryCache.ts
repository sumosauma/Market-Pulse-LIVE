/** Shared TTL for the Banque de France TEC yield-curve history cache. */
export const FR_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function isFranceHistoryCacheFresh(savedAtIsoOrMs: string | number, nowMs = Date.now()): boolean {
  const savedMs = typeof savedAtIsoOrMs === "number" ? savedAtIsoOrMs : Date.parse(savedAtIsoOrMs);
  if (!Number.isFinite(savedMs)) return false;
  const age = nowMs - savedMs;
  return age >= 0 && age < FR_HISTORY_CACHE_TTL_MS;
}
