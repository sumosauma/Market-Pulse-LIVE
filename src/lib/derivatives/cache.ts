import type { MarketVolatilityPayload } from "./types";

const DISK_CACHE_PATH = "data/cache/derivatives-vol.json";
export const DERIVATIVES_VOL_CACHE_MS = 15 * 60 * 1000;

type DiskCacheFile = {
  version: 6;
  savedAt: string;
  payload: MarketVolatilityPayload | null;
};

const memory: { savedAt: string; payload: MarketVolatilityPayload | null } = {
  savedAt: "",
  payload: null,
};

function readDisk(): DiskCacheFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(DISK_CACHE_PATH)) return { version: 6, savedAt: "", payload: null };
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== 6) return { version: 6, savedAt: "", payload: null };
    return { version: 6, savedAt: raw.savedAt ?? "", payload: raw.payload ?? null };
  } catch {
    return { version: 6, savedAt: "", payload: null };
  }
}

function writeDisk(file: DiskCacheFile): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file), "utf8");
  } catch {
    /* read-only filesystem */
  }
}

function isFresh(savedAt: string, now: number): boolean {
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return false;
  return now - t <= DERIVATIVES_VOL_CACHE_MS;
}

export function readFreshVolCache(now = Date.now()): MarketVolatilityPayload | null {
  if (memory.payload && isFresh(memory.savedAt, now)) {
    return { ...memory.payload, fromCache: true };
  }
  const disk = readDisk();
  if (disk.payload && isFresh(disk.savedAt, now)) {
    memory.savedAt = disk.savedAt;
    memory.payload = disk.payload;
    return { ...disk.payload, fromCache: true };
  }
  return null;
}

export function readAnyVolCache(): MarketVolatilityPayload | null {
  if (memory.payload) return memory.payload;
  return readDisk().payload;
}

export function writeVolCache(payload: MarketVolatilityPayload): void {
  const savedAt = new Date().toISOString();
  memory.savedAt = savedAt;
  memory.payload = payload;
  writeDisk({ version: 6, savedAt, payload });
}
