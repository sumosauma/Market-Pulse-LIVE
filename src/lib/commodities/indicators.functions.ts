import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { CommodityIndicators } from "./indicators";
import { loadCommodityIndicators } from "./indicators.server";

const DISK_CACHE_PATH = "data/cache/commodities-indicators.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped when Brent–WTI history switched from continuous BZ=F−CL=F to listed same-month. */
const CACHE_VERSION = 13;
/** Reject snapshots that only have a couple of RV rows — they poison the desk for 15m. */
const MIN_RV20_ROWS = 6;

export const COMMODITY_INDICATORS_QUERY_KEY = ["commodities-indicators", "v13"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: CommodityIndicators | null;
};

const memory: { savedAt: number; payload: CommodityIndicators | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<CommodityIndicators> | null = null;

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

function usable(payload: CommodityIndicators | null): payload is CommodityIndicators {
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

function readDisk(): CommodityIndicators | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !usable(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: CommodityIndicators): void {
  try {
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = { version: CACHE_VERSION, savedAt: new Date().toISOString(), payload };
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file));
  } catch {
    // The live payload is still returned when the cache file cannot be written.
  }
}

async function loadCached(): Promise<CommodityIndicators> {
  if (usable(memory.payload) && Date.now() - memory.savedAt < CACHE_MS) return memory.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await loadCommodityIndicators();
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

export const getCommodityIndicators = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityIndicators> => loadCached(),
);
