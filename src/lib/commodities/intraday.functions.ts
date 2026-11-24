import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { CommodityIntradayPayload } from "./intraday";
import { INTRADAY_MIN_POINTS } from "./intraday";
import { loadCommodityIntraday } from "./intraday.server";

const DISK_CACHE_PATH = "data/cache/commodities-intraday.json";
/** Fresher than daily overview — 5-minute bars move often. */
const CACHE_MS = 5 * 60 * 1000;
const CACHE_VERSION = 1;

export const COMMODITY_INTRADAY_QUERY_KEY = ["commodities-intraday", "v1"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: CommodityIntradayPayload | null;
};

const memory: { savedAt: number; payload: CommodityIntradayPayload | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<CommodityIntradayPayload> | null = null;

function usable(payload: CommodityIntradayPayload | null | undefined): payload is CommodityIntradayPayload {
  if (!payload?.series?.length) return false;
  // At least one enabled series — avoid caching a total blackout as success.
  return payload.series.some((row) => row.points.length >= INTRADAY_MIN_POINTS);
}

function readDisk(): CommodityIntradayPayload | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !usable(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: CommodityIntradayPayload): void {
  try {
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      payload,
    };
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file));
  } catch {
    // Live payload still returned.
  }
}

async function loadCached(): Promise<CommodityIntradayPayload> {
  if (usable(memory.payload) && Date.now() - memory.savedAt < CACHE_MS) return memory.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await loadCommodityIntraday();
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

export const getCommodityIntraday = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityIntradayPayload> => loadCached(),
);
