import type { CommodityIntradayPayload, CommodityIntradaySeries } from "./intraday";
import { INTRADAY_MIN_POINTS } from "./intraday";
import { loadCommodityIntraday } from "./intraday.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-intraday.json";
/** Fresher than daily overview — 5-minute bars move often. */
const CACHE_MS = 5 * 60 * 1000;
/** Bumped when prior-session fallback + per-series merge landed (invalidate sparse overnight disks). */
const CACHE_VERSION = 2;

function seriesEligible(row: CommodityIntradaySeries | null | undefined): boolean {
  return Boolean(
    row && row.unavailableReason == null && row.points.length >= INTRADAY_MIN_POINTS,
  );
}

function usable(
  payload: CommodityIntradayPayload | null | undefined,
): payload is CommodityIntradayPayload {
  if (!payload?.series?.length) return false;
  // At least one enabled series — avoid caching a total blackout as success.
  return payload.series.some((row) => seriesEligible(row));
}

/**
 * Per-series protection: never replace a valid cached series with an insufficient
 * live row (e.g. post-midnight sparse "today" before prior-session fallback fills in,
 * or a transient empty Avanza response while Yahoo rows remain usable).
 * Once live has ≥24 points for that id, it wins (auto switch to today's session).
 */
export function mergeIntradayLive(
  live: CommodityIntradayPayload,
  prior: CommodityIntradayPayload | null,
): CommodityIntradayPayload {
  if (!prior?.series?.length) return live;
  const priorById = new Map(prior.series.map((row) => [row.id, row]));
  let changed = false;
  const series = live.series.map((row) => {
    if (seriesEligible(row)) return row;
    const cached = priorById.get(row.id);
    if (seriesEligible(cached)) {
      changed = true;
      return cached!;
    }
    return row;
  });
  return changed ? { ...live, series } : live;
}

const cache = createSwrCache<CommodityIntradayPayload>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: loadCommodityIntraday,
  mergeLive: mergeIntradayLive,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

export function getCachedCommodityIntraday(): Promise<CommodityIntradayPayload> {
  return cache.load();
}

/** Test helper — clears process memory so disk / cold paths can be exercised. */
export function clearCommodityIntradaySwrMemoryForTest(): void {
  cache.clearMemory();
}
