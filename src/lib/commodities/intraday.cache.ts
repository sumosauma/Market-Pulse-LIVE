import type { CommodityIntradayPayload } from "./intraday";
import { INTRADAY_MIN_POINTS } from "./intraday";
import { loadCommodityIntraday } from "./intraday.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-intraday.json";
/** Fresher than daily overview — 5-minute bars move often. */
const CACHE_MS = 5 * 60 * 1000;
const CACHE_VERSION = 1;

function usable(
  payload: CommodityIntradayPayload | null | undefined,
): payload is CommodityIntradayPayload {
  if (!payload?.series?.length) return false;
  // At least one enabled series — avoid caching a total blackout as success.
  return payload.series.some((row) => row.points.length >= INTRADAY_MIN_POINTS);
}

const cache = createSwrCache<CommodityIntradayPayload>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: loadCommodityIntraday,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

export function getCachedCommodityIntraday(): Promise<CommodityIntradayPayload> {
  return cache.load();
}
