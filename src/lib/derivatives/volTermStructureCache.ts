import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { VolTermStructurePayload } from "./volTermStructure";

const DISK_CACHE_PATH = "data/cache/derivatives-vol-term-structure.json";
export const VOL_TERM_CACHE_MS = 15 * 60 * 1000;

type DiskCacheFile = {
  version: 4;
  savedAt: string;
  payload: VolTermStructurePayload | null;
};

const memory: { version: number; savedAt: string; payload: VolTermStructurePayload | null } = {
  version: 0,
  savedAt: "",
  payload: null,
};

function emptyFile(): DiskCacheFile {
  return { version: 4, savedAt: "", payload: null };
}

function readDisk(): DiskCacheFile {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return emptyFile();
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== 4 || !raw.payload?.historySnapshots) return emptyFile();
    return { version: 4, savedAt: raw.savedAt ?? "", payload: raw.payload ?? null };
  } catch {
    return emptyFile();
  }
}

function writeDisk(file: DiskCacheFile): void {
  try {
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
  if (memory.payload?.historySnapshots && memory.version === 4 && isFresh(memory.savedAt, now)) {
    return { ...memory.payload, fromCache: true };
  }
  const disk = readDisk();
  if (disk.payload && isFresh(disk.savedAt, now)) {
    memory.version = 4;
    memory.savedAt = disk.savedAt;
    memory.payload = disk.payload;
    return { ...disk.payload, fromCache: true };
  }
  return null;
}

export function writeVolTermCache(payload: VolTermStructurePayload): void {
  const savedAt = new Date().toISOString();
  memory.version = 4;
  memory.savedAt = savedAt;
  memory.payload = payload;
  writeDisk({ version: 4, savedAt, payload });
}
