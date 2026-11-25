import type { CommodityIndicators } from "./indicators";
import { loadCommodityIndicators } from "./indicators.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-indicators.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped when Brent–WTI history switched from continuous BZ=F−CL=F to listed same-month. */
const CACHE_VERSION = 13;
/** Reject snapshots that only have a couple of RV rows — they poison the desk for 15m. */
const MIN_RV20_ROWS = 6;

function crossMarketHistoryAttached(
  history: CommodityIndicators["brentWti"]["history"] | undefined,
): boolean {
  if (!history || typeof history !== "object") return false;
  // Placeholders from live loaders before attach must never cache-hit.
  if (history.unavailableReason?.includes("not attached")) return false;
  if (history.unavailableReason == null) {
    return (
      typeof history.weekChange === "number" &&
      Number.isFinite(history.weekChange) &&
      typeof history.yearLow === "number" &&
      typeof history.yearHigh === "number" &&
      typeof history.latest === "number"
    );
  }
  return typeof history.unavailableReason === "string" && history.unavailableReason.length > 0;
}

function usable(payload: CommodityIndicators | null | undefined): payload is CommodityIndicators {
  if (!payload) return false;
  if (!Array.isArray(payload.history) || payload.history.length === 0) return false;
  if (!crossMarketHistoryAttached(payload.brentWti?.history)) return false;
  if (!crossMarketHistoryAttached(payload.goldSilver?.history)) return false;
  // Reject payloads that predate RV kind / abs-change Nordic methodology.
  const hasRvKind = payload.history.some((row) => row.rvKind === "ann_pct" || row.rvKind === "abs_change");
  if (!hasRvKind) return false;
  const rv20Count = payload.history.filter(
    (row) => typeof row.rv20 === "number" && Number.isFinite(row.rv20),
  ).length;
  if (rv20Count >= MIN_RV20_ROWS) return true;
  // Spreads alone are not enough — Price History / 20D RV would stay blank.
  return false;
}

const cache = createSwrCache<CommodityIndicators>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: () => loadCommodityIndicators(),
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

/** Shared resolver used by Signals and the HTTP endpoint — one SWR cache. */
export function getCachedCommodityIndicators(): Promise<CommodityIndicators> {
  return cache.load();
}
