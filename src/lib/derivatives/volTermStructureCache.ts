import type { VolTermStructurePayload } from "./volTermStructure";

const DISK_CACHE_PATH = "data/cache/derivatives-vol-term-structure.json";
export const VOL_TERM_CACHE_MS = 15 * 60 * 1000;

type DiskCacheFile = {
  version: 3;
  savedAt: string;
  payload: VolTermStructurePayload | null;
};

const memory: { version: number; savedAt: string; payload: VolTermStructurePayload | null } = {
  version: 0,
  savedAt: "",
  payload: null,
};

function emptyFile(): DiskCacheFile {
  return { version: 3, savedAt: "", payload: null };
}

function readDisk(): DiskCacheFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(DISK_CACHE_PATH)) return emptyFile();
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== 3) return emptyFile();
    return { version: 3, savedAt: raw.savedAt ?? "", payload: raw.payload ?? null };
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
  return now - t <= VOL_TERM_CACHE_MS;
}

export function readFreshVolTermCache(now = Date.now()): VolTermStructurePayload | null {
  if (memory.payload && memory.version === 3 && isFresh(memory.savedAt, now)) {
    return { ...memory.payload, fromCache: true };
  }
  const disk = readDisk();
  if (disk.payload && isFresh(disk.savedAt, now)) {
    memory.version = 3;
    memory.savedAt = disk.savedAt;
    memory.payload = disk.payload;
    return { ...disk.payload, fromCache: true };
  }
  return null;
}

export function writeVolTermCache(payload: VolTermStructurePayload): void {
  const savedAt = new Date().toISOString();
  memory.version = 3;
  memory.savedAt = savedAt;
  memory.payload = payload;
  writeDisk({ version: 3, savedAt, payload });
}
