import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { FuturesTermStructure } from "./futuresCurve";
import { loadFuturesTermStructure } from "./futuresCurve.server";

const DISK_CACHE_PATH = "data/cache/commodities-futures-curve.json";
const CACHE_MS = 15 * 60 * 1000;
const CACHE_VERSION = 12;

export const FUTURES_CURVE_QUERY_KEY = ["commodities-futures-curve", "v12"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: FuturesTermStructure | null;
};

const memory: { savedAt: number; payload: FuturesTermStructure | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<FuturesTermStructure> | null = null;

function usable(payload: FuturesTermStructure | null): payload is FuturesTermStructure {
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

function readDisk(): FuturesTermStructure | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !usable(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: FuturesTermStructure): void {
  try {
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = { version: CACHE_VERSION, savedAt: new Date().toISOString(), payload };
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file));
  } catch {
    // The live payload is still returned when the cache file cannot be written.
  }
}

async function loadCached(): Promise<FuturesTermStructure> {
  if (usable(memory.payload) && Date.now() - memory.savedAt < CACHE_MS) return memory.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await loadFuturesTermStructure();
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

export const getFuturesTermStructure = createServerFn({ method: "GET" }).handler(
  async (): Promise<FuturesTermStructure> => loadCached(),
);
