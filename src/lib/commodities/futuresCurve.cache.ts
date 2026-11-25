import type { FuturesTermStructure } from "./futuresCurve";
import { loadFuturesTermStructure } from "./futuresCurve.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-futures-curve.json";
const CACHE_MS = 15 * 60 * 1000;
const CACHE_VERSION = 14;

function usable(payload: FuturesTermStructure | null | undefined): payload is FuturesTermStructure {
  return Boolean(
    payload?.curves.some(
      (curve) =>
        curve.enabled &&
        curve.points.length >= 2 &&
        Array.isArray(curve.history) &&
        curve.history.length === 4,
    ),
  );
}

const cache = createSwrCache<FuturesTermStructure>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: () => loadFuturesTermStructure(),
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

/** Shared resolver used by Signals and the HTTP endpoint — one SWR cache. */
export function getCachedFuturesTermStructure(): Promise<FuturesTermStructure> {
  return cache.load();
}
