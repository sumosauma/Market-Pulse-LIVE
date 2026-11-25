import type { SectorPerformance } from "./sectorPerformance";
import { loadSectorPerformance } from "./sectorPerformance.server";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-sector-performance.json";
const CACHE_MS = 15 * 60 * 1000;
const CACHE_VERSION = 2;

function usable(payload: SectorPerformance | null | undefined): payload is SectorPerformance {
  return (
    !!payload?.providers &&
    Object.values(payload.providers).some((provider) =>
      provider.rows.some((row) => row.cells.some((cell) => cell.returnPct != null)),
    )
  );
}

const cache = createSwrCache<SectorPerformance>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  loadLive: loadSectorPerformance,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

export function getCachedSectorPerformance(): Promise<SectorPerformance> {
  return cache.load();
}
