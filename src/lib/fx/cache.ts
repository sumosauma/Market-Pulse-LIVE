import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FxLivePayload, FxPoint } from "./types";

function diskPath(): string {
  return join(process.cwd(), "data", "cache", "frankfurter-fx.json");
}

/** Rates publish once per weekday ~16:00 CET — a half-day cache is enough. */
export const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type HistoryEntry = { savedAt: string; points: FxPoint[] };

type DiskCacheFile = {
  version: 1;
  savedAt: string;
  live: FxLivePayload | null;
  history: Record<string, HistoryEntry>;
};

const memory: DiskCacheFile = { version: 1, savedAt: "", live: null, history: {} };
let diskHydrated = false;

function emptyFile(): DiskCacheFile {
  return { version: 1, savedAt: new Date().toISOString(), live: null, history: {} };
}

function readDisk(): DiskCacheFile {
  try {
    const path = diskPath();
    if (!existsSync(path)) return emptyFile();
    const raw = JSON.parse(readFileSync(path, "utf8")) as DiskCacheFile;
    if (raw?.version !== 1) return emptyFile();
    return {
      version: 1,
      savedAt: raw.savedAt ?? "",
      live: raw.live ?? null,
      history: raw.history ?? {},
    };
  } catch {
    return emptyFile();
  }
}

function writeDisk(file: DiskCacheFile): void {
  try {
    const path = diskPath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(file), "utf8");
    console.log(
      `[FX][cache] wrote ${path} live=${file.live ? "yes" : "no"} history=${Object.keys(file.history).length}`,
    );
  } catch (e) {
    console.log(`[FX][cache] write skipped: ${e instanceof Error ? e.message : e}`);
  }
}

function hydrate(): void {
  if (diskHydrated) return;
  const disk = readDisk();
  memory.savedAt = disk.savedAt;
  memory.live = disk.live;
  memory.history = disk.history;
  diskHydrated = true;
}

function persist(): void {
  memory.savedAt = new Date().toISOString();
  writeDisk(memory);
}

function isFresh(savedAt: string, now: number): boolean {
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return false;
  return now - t <= FX_CACHE_TTL_MS;
}

export function historyCacheKey(pairId: string, timeframe: string): string {
  return `${pairId}:${timeframe}`;
}

export function readFreshLive(now = Date.now()): FxLivePayload | null {
  hydrate();
  const live = memory.live;
  if (!live?.fetchedAt || !isFresh(live.fetchedAt, now)) return null;
  return live;
}

export function readAnyLive(): FxLivePayload | null {
  hydrate();
  return memory.live;
}

export function writeLive(payload: FxLivePayload): void {
  hydrate();
  memory.live = payload;
  persist();
}

export function readFreshHistory(key: string, now = Date.now()): HistoryEntry | null {
  hydrate();
  const row = memory.history[key];
  if (!row || !isFresh(row.savedAt, now)) return null;
  return row;
}

export function readAnyHistory(key: string): HistoryEntry | null {
  hydrate();
  return memory.history[key] ?? null;
}

export function writeHistory(key: string, points: FxPoint[]): void {
  hydrate();
  memory.history[key] = { savedAt: new Date().toISOString(), points };
  persist();
}
