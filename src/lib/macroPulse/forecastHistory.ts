import type { MacroPulseIndicatorId } from "./types";

export type ForecastPoint = Readonly<{
  at: string;
  observationMonth: string;
  forecast: number;
}>;

export type ForecastHistoryFile = {
  savedAt: string;
  entries: Record<string, ForecastPoint[]>;
};

const HISTORY_PATH = "data/cache/macro-forecast-history.json";
const CACHE_REQUEST = "https://macro-pulse.internal/forecast-history";

const memory = new Map<string, ForecastPoint[]>();
let persistEnabled = true;

export function setForecastPersistenceEnabled(enabled: boolean): void {
  persistEnabled = enabled;
}

function historyKey(indicatorId: string, observationMonth: string): string {
  return `${indicatorId}|${observationMonth}`;
}

function clonePoints(points: readonly ForecastPoint[]): ForecastPoint[] {
  return points.map((p) => ({ ...p }));
}

function readFs(): ForecastHistoryFile | null {
  if (!persistEnabled) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path") as typeof import("path");
    const fp = join(HISTORY_PATH);
    if (!existsSync(fp)) return null;
    const raw = JSON.parse(readFileSync(fp, "utf8")) as ForecastHistoryFile;
    if (!raw?.entries || typeof raw.savedAt !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeFs(file: ForecastHistoryFile): void {
  if (!persistEnabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname, join } = require("path") as typeof import("path");
    const fp = join(HISTORY_PATH);
    const dir = dirname(fp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fp, JSON.stringify(file, null, 2), "utf8");
  } catch {
    /* Workers / read-only filesystem */
  }
}

async function readCaches(): Promise<ForecastHistoryFile | null> {
  if (!persistEnabled) return null;
  try {
    const cachesApi = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (!cachesApi) return null;
    const res = await cachesApi.match(CACHE_REQUEST);
    if (!res) return null;
    const raw = (await res.json()) as ForecastHistoryFile;
    if (!raw?.entries) return null;
    return raw;
  } catch {
    return null;
  }
}

async function writeCaches(file: ForecastHistoryFile): Promise<void> {
  if (!persistEnabled) return;
  try {
    const cachesApi = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (!cachesApi) return;
    await cachesApi.put(
      CACHE_REQUEST,
      new Response(JSON.stringify(file), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=2592000" },
      }),
    );
  } catch {
    /* Cache API unavailable */
  }
}

function mergeFiles(...files: Array<ForecastHistoryFile | null>): Record<string, ForecastPoint[]> {
  const entries: Record<string, ForecastPoint[]> = {};
  for (const file of files) {
    if (!file) continue;
    for (const [key, points] of Object.entries(file.entries)) {
      const current = entries[key] ?? [];
      const byAt = new Map(current.map((p) => [p.at, p]));
      for (const point of points) byAt.set(point.at, point);
      entries[key] = [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
    }
  }
  for (const [key, points] of memory.entries()) {
    const current = entries[key] ?? [];
    const byAt = new Map(current.map((p) => [p.at, p]));
    for (const point of points) byAt.set(point.at, point);
    entries[key] = [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
  }
  return entries;
}

export function appendForecastPoint(
  points: readonly ForecastPoint[],
  next: ForecastPoint,
): ForecastPoint[] {
  const sorted = clonePoints(points).sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted.at(-1);
  if (last && last.forecast === next.forecast && last.observationMonth === next.observationMonth) {
    sorted[sorted.length - 1] = next;
    return sorted;
  }
  sorted.push(next);
  return sorted;
}

export function previousDistinctForecast(points: readonly ForecastPoint[]): number | null {
  if (points.length < 2) return null;
  const current = points.at(-1)!.forecast;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i]!.forecast !== current) return points[i]!.forecast;
  }
  return null;
}

export async function recordForecastSnapshot(
  indicatorId: MacroPulseIndicatorId,
  observationMonth: string,
  forecast: number,
  at = new Date(),
): Promise<ForecastPoint[]> {
  const key = historyKey(indicatorId, observationMonth);
  const disk = readFs();
  const cacheFile = await readCaches();
  const merged = mergeFiles(disk, cacheFile);
  const existing = merged[key] ?? memory.get(key) ?? [];
  const updated = appendForecastPoint(existing, {
    at: at.toISOString(),
    observationMonth,
    forecast,
  });
  merged[key] = updated;
  memory.set(key, updated);
  const file: ForecastHistoryFile = { savedAt: at.toISOString(), entries: merged };
  writeFs(file);
  await writeCaches(file);
  return updated;
}

export async function readForecastHistory(
  indicatorId: MacroPulseIndicatorId,
  observationMonth: string,
): Promise<ForecastPoint[]> {
  const key = historyKey(indicatorId, observationMonth);
  if (memory.has(key)) return memory.get(key)!;
  const merged = mergeFiles(readFs(), await readCaches());
  const points = merged[key] ?? [];
  memory.set(key, points);
  return points;
}

export function resetForecastHistoryMemory(): void {
  memory.clear();
}
