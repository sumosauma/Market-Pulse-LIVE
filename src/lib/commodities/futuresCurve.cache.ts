import type { FuturesTermStructure } from "./futuresCurve";
import { loadFuturesTermStructure } from "./futuresCurve.server";
import {
  fetchFuturesCurveRemoteEnvelope,
  pickBestFuturesCurve,
} from "./futuresCurve.remote";
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

/**
 * Every live refresh (including SWR revalidation while disk/memory are populated)
 * re-fetches the remote gist and keeps the stronger of live vs remote. That way
 * DigitalOcean picks up new localhost publishes within CACHE_MS without a redeploy.
 */
async function loadLivePreferringRemote(): Promise<FuturesTermStructure> {
  const remotePromise = fetchFuturesCurveRemoteEnvelope().catch(() => null);
  let live: FuturesTermStructure | null = null;
  let liveError: unknown = null;
  try {
    live = await loadFuturesTermStructure();
  } catch (err) {
    liveError = err;
  }
  const remote = await remotePromise;
  const remotePayload = remote && remote.version === CACHE_VERSION ? remote.payload : null;
  const best = pickBestFuturesCurve(live, remotePayload);
  if (best) return best;
  if (liveError) throw liveError;
  throw new Error("Futures curve live load and remote snapshot are both unavailable.");
}

const cache = createSwrCache<FuturesTermStructure>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: () => loadLivePreferringRemote(),
  // Keep the stronger of live/remote vs in-memory prior (blocks Yahoo from wiping CME).
  mergeLive: (live, prior) => pickBestFuturesCurve(live, prior) ?? live,
  shouldPersist: (payload) => usable(payload),
  hydrateRemote: async () => {
    const remote = await fetchFuturesCurveRemoteEnvelope();
    if (!remote || remote.version !== CACHE_VERSION || !usable(remote.payload)) return null;
    const savedAt = Date.parse(remote.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    return { savedAt, payload: remote.payload };
  },
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

/** Shared resolver used by Signals and the HTTP endpoint — one SWR cache. */
export function getCachedFuturesTermStructure(): Promise<FuturesTermStructure> {
  return cache.load();
}

/** Test / sync helpers. */
export const __futuresCurveCacheTest = {
  clearMemory: () => cache.clearMemory(),
  getMemory: () => cache.getMemory(),
  usable,
  CACHE_VERSION,
  DISK_CACHE_PATH,
};
