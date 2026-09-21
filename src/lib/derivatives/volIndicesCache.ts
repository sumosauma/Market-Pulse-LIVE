import type { VolIndicesPayload } from "./volIndices";

const DISK_CACHE_PATH = "data/cache/derivatives-vol-indices.json";
export const VOL_INDICES_CACHE_MS = 15 * 60 * 1000;
const CACHE_VERSION = 9 as const;

type DiskCacheFile = {
  version: typeof CACHE_VERSION;
  savedAt: string;
  payload: VolIndicesPayload | null;
};

const memory: { version: number; savedAt: string; payload: VolIndicesPayload | null } = {
  version: 0,
  savedAt: "",
  payload: null,
};

function emptyFile(): DiskCacheFile {
  return { version: CACHE_VERSION, savedAt: "", payload: null };
}

function readDisk(): DiskCacheFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(DISK_CACHE_PATH)) return emptyFile();
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION) return emptyFile();
    return { version: CACHE_VERSION, savedAt: raw.savedAt ?? "", payload: raw.payload ?? null };
  } catch {
    return emptyFile();
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
  return now - t <= VOL_INDICES_CACHE_MS;
}

export function readFreshVolIndicesCache(now = Date.now()): VolIndicesPayload | null {
  if (memory.payload && memory.version === CACHE_VERSION && isFresh(memory.savedAt, now)) {
    return { ...memory.payload, fromCache: true, spxVixDayMove: memory.payload.spxVixDayMove ?? null, sx5eVstoxxDayMove: memory.payload.sx5eVstoxxDayMove ?? null, skew: memory.payload.skew ?? null };
  }
  const disk = readDisk();
  if (disk.payload && isFresh(disk.savedAt, now)) {
    memory.version = CACHE_VERSION;
    memory.savedAt = disk.savedAt;
    memory.payload = disk.payload;
    return { ...disk.payload, fromCache: true, spxVixDayMove: disk.payload.spxVixDayMove ?? null, sx5eVstoxxDayMove: disk.payload.sx5eVstoxxDayMove ?? null, skew: disk.payload.skew ?? null };
  }
  return null;
}

export function writeVolIndicesCache(payload: VolIndicesPayload): void {
  const savedAt = new Date().toISOString();
  memory.version = CACHE_VERSION;
  memory.savedAt = savedAt;
  memory.payload = payload;
  writeDisk({ version: CACHE_VERSION, savedAt, payload });
}
