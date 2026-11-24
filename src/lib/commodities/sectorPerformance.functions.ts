import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { SectorPerformance } from "./sectorPerformance";
import { loadSectorPerformance } from "./sectorPerformance.server";

const DISK_CACHE_PATH = "data/cache/commodities-sector-performance.json";
const CACHE_MS = 15 * 60 * 1000;
const CACHE_VERSION = 2;

export const SECTOR_PERFORMANCE_QUERY_KEY = ["commodities-sector-performance", "v2"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: SectorPerformance | null;
};

const memory: { savedAt: number; payload: SectorPerformance | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<SectorPerformance> | null = null;

function usable(payload: SectorPerformance | null): payload is SectorPerformance {
  return (
    !!payload?.providers &&
    Object.values(payload.providers).some((provider) =>
      provider.rows.some((row) => row.cells.some((cell) => cell.returnPct != null)),
    )
  );
}

function readDisk(): SectorPerformance | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !usable(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: SectorPerformance): void {
  try {
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = { version: CACHE_VERSION, savedAt: new Date().toISOString(), payload };
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file));
  } catch {
    // The live payload is still returned when the cache file cannot be written.
  }
}

async function loadCached(): Promise<SectorPerformance> {
  if (usable(memory.payload) && Date.now() - memory.savedAt < CACHE_MS) return memory.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await loadSectorPerformance();
      if (usable(payload)) {
        memory.savedAt = Date.now();
        memory.payload = payload;
        writeDisk(payload);
        return payload;
      }
      const stale = usable(memory.payload) ? memory.payload : readDisk();
      if (stale) return { ...stale, fromStaleCache: true };
      return payload;
    } catch (err) {
      const stale = usable(memory.payload) ? memory.payload : readDisk();
      if (stale) return { ...stale, fromStaleCache: true };
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const getSectorPerformance = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorPerformance> => loadCached(),
);
