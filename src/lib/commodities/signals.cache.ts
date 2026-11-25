import type { CommoditySignalsPayload } from "./signals";
import { emptySignalsPayload } from "./signals";
import { loadCommoditySignalsSafe } from "./signals.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-signals.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped to refresh currency category heading after rename. */
const CACHE_VERSION = 13;

function usable(
  payload: CommoditySignalsPayload | null | undefined,
): payload is CommoditySignalsPayload {
  if (!payload) return false;
  if (!Array.isArray(payload.signals)) return false;
  if (!Array.isArray(payload.qualifyingIds)) return false;
  return typeof payload.fetchedAt === "string";
}

const cache = createSwrCache<CommoditySignalsPayload>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: async () => {
    try {
      return await loadCommoditySignalsSafe();
    } catch (err) {
      return emptySignalsPayload({
        coverageInsufficient: true,
        futuresRepricingInactiveReason:
          err instanceof Error ? err.message : "Signal feed failed.",
      });
    }
  },
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
  // Prefer a prior good cache over a thin/failed evaluation.
  shouldPersist: (payload) => usable(payload) && !payload.coverageInsufficient,
  returnUnpersistedLive: true,
});

export function getCachedCommoditySignals(): Promise<CommoditySignalsPayload> {
  return cache.load();
}
