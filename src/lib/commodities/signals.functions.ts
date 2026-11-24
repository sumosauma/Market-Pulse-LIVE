import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { CommoditySignalsPayload } from "./signals";
import { emptySignalsPayload } from "./signals";
import { loadCommoditySignalsSafe } from "./signals.server";

const DISK_CACHE_PATH = "data/cache/commodities-signals.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped to refresh currency category heading after rename. */
const CACHE_VERSION = 13;

export const COMMODITY_SIGNALS_QUERY_KEY = ["commodities-signals", "v14"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: CommoditySignalsPayload | null;
};

const memory: { savedAt: number; payload: CommoditySignalsPayload | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<CommoditySignalsPayload> | null = null;

function usable(payload: CommoditySignalsPayload | null): payload is CommoditySignalsPayload {
  if (!payload) return false;
  if (!Array.isArray(payload.signals)) return false;
  if (!Array.isArray(payload.qualifyingIds)) return false;
  return typeof payload.fetchedAt === "string";
}

function readDisk(): CommoditySignalsPayload | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !usable(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: CommoditySignalsPayload): void {
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

async function loadCached(): Promise<CommoditySignalsPayload> {
  if (usable(memory.payload) && Date.now() - memory.savedAt < CACHE_MS) return memory.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await loadCommoditySignalsSafe();
      if (usable(payload) && !payload.coverageInsufficient) {
        memory.savedAt = Date.now();
        memory.payload = payload;
        writeDisk(payload);
        return payload;
      }
      // Prefer a prior good cache over a thin/failed evaluation.
      const stale = usable(memory.payload) ? memory.payload : readDisk();
      if (stale && payload.coverageInsufficient) {
        return { ...stale, fromStaleCache: true };
      }
      if (usable(payload)) {
        memory.savedAt = Date.now();
        memory.payload = payload;
        writeDisk(payload);
      }
      return payload;
    } catch (err) {
      const stale = usable(memory.payload) ? memory.payload : readDisk();
      if (stale) return { ...stale, fromStaleCache: true };
      return emptySignalsPayload({
        coverageInsufficient: true,
        futuresRepricingInactiveReason:
          err instanceof Error ? err.message : "Signal feed failed.",
      });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const getCommoditySignals = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommoditySignalsPayload> => loadCached(),
);
