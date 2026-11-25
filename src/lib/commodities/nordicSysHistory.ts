/**
 * Nord Pool day-ahead Nordic System Price (SYS) history.
 *
 * Source: free dataportal DayAheadPrices for deliveryArea=SYS / EUR.
 * Uses official areaAverages.SYS daily average (time-weighted by Nord Pool);
 * does not interpolate missing settlement periods.
 *
 * Free unauthenticated access only covers a recent window (~2 months); older
 * dates return HTTP 401. Successful days are merged into a durable disk cache
 * so history can accumulate across refreshes without re-fetching authenticated
 * history or substituting bidding-zone proxies (SE3/NO1/etc.).
 *
 * Live fetches are process-wide deduped. After the durable cache is populated,
 * only missing dates and a short recent window (corrections) are re-requested.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DISK_PATH = "data/cache/nordic-sys-daily.json";
const FILE_VERSION = 1;
const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 3;
const MAX_RETRIES = 4;
/** Walk this many CET calendar days back; free API 401s beyond its window. */
export const NORDIC_LIVE_LOOKBACK_DAYS = 100;
/**
 * Re-fetch this many most-recent complete delivery days every refresh so official
 * corrections land without re-walking the full free window.
 */
export const NORDIC_REVALIDATE_RECENT_DAYS = 7;
/** Process-local share across Overview / Indicators / Signals within one page load. */
const MEMORY_TTL_MS = 60_000;
/** Day-ahead auction results for D+1 typically print after ~13:00 Europe/Stockholm. */
const AUCTION_HOUR_STOCKHOLM = 13;

export type NordicSysBar = {
  date: string;
  close: number;
};

type CacheFile = {
  version: number;
  updatedAt: string;
  bars: NordicSysBar[];
};

const memory: { bars: NordicSysBar[] | null; fetchedAt: number } = {
  bars: null,
  fetchedAt: 0,
};

let inflight: Promise<NordicSysBar[]> | null = null;

function stockholmParts(now = new Date()): {
  date: string;
  hour: number;
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, hour, year, month, day };
}

/** Add calendar days in Europe/Stockholm (DST-safe via noon CET anchor). */
export function stockholmDateOffset(baseDate: string, days: number): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  // Noon UTC ≈ midday in Stockholm year-round enough for calendar arithmetic.
  const utc = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const shifted = new Date(utc + days * 86_400_000);
  return stockholmParts(shifted).date;
}

export {
  nordicCalendarChangePct,
  nordicCalendarTargetDate,
  stockholmDateOffsetMonths,
  type NordicReturnHorizon,
} from "./nordicSysCalendar";

/**
 * Latest delivery date whose day-ahead auction is expected to be complete.
 * Before ~13:00 Stockholm → through "today"; after → through "tomorrow".
 */
export function latestCompleteSysDeliveryDate(now = new Date()): string {
  const { date, hour } = stockholmParts(now);
  return hour >= AUCTION_HOUR_STOCKHOLM ? stockholmDateOffset(date, 1) : date;
}

function readDisk(): NordicSysBar[] {
  try {
    if (!existsSync(DISK_PATH)) return [];
    const raw = JSON.parse(readFileSync(DISK_PATH, "utf8")) as CacheFile;
    if (raw?.version !== FILE_VERSION || !Array.isArray(raw.bars)) return [];
    return normalizeBars(raw.bars);
  } catch {
    return [];
  }
}

function writeDisk(bars: NordicSysBar[]): void {
  try {
    const dir = dirname(DISK_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: CacheFile = {
      version: FILE_VERSION,
      updatedAt: new Date().toISOString(),
      bars,
    };
    writeFileSync(DISK_PATH, JSON.stringify(file));
  } catch {
    // Best-effort persistence.
  }
}

/** Keep finite closes (incl. ≤0), last write wins per date, sorted ascending. */
export function normalizeBars(rows: readonly NordicSysBar[]): NordicSysBar[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row?.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    if (typeof row.close !== "number" || !Number.isFinite(row.close)) continue;
    byDate.set(row.date, row.close);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, close]) => ({ date, close }));
}

function mergeBars(existing: readonly NordicSysBar[], incoming: readonly NordicSysBar[]): NordicSysBar[] {
  return normalizeBars([...existing, ...incoming]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSysDay(date: string): Promise<NordicSysBar | null> {
  const url =
    `https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices?date=${date}` +
    "&market=DayAhead&deliveryArea=SYS&currency=EUR";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        if (attempt === MAX_RETRIES) return null;
        await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 200));
        continue;
      }
      if (!res.ok) return null;

      const json = (await res.json()) as {
        deliveryDateCET?: string;
        currency?: string;
        areaAverages?: { areaCode?: string; price?: number }[];
        multiAreaEntries?: { entryPerArea?: Record<string, number | null | undefined> }[];
      };

      if (json.currency && json.currency !== "EUR") return null;
      if (json.deliveryDateCET && json.deliveryDateCET !== date) return null;

      const periods = json.multiAreaEntries;
      if (Array.isArray(periods) && periods.length > 0) {
        // Incomplete auction day: any null/missing SYS settlement period → skip (no interpolate).
        for (const period of periods) {
          const v = period.entryPerArea?.SYS;
          if (typeof v !== "number" || !Number.isFinite(v)) return null;
        }
      }

      const sys = json.areaAverages?.find((row) => row.areaCode === "SYS");
      if (typeof sys?.price !== "number" || !Number.isFinite(sys.price)) return null;
      return { date, close: sys.price };
    } catch {
      if (attempt === MAX_RETRIES) return null;
      await sleep(400 * 2 ** attempt);
    }
  }
  return null;
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** Dates in the free lookback window that are missing or in the recent revalidate band. */
export function selectNordicFetchDates(
  cached: readonly NordicSysBar[],
  now = new Date(),
): { latestComplete: string; dates: string[] } {
  const latestComplete = latestCompleteSysDeliveryDate(now);
  const today = stockholmParts(now).date;
  const cachedByDate = new Map(cached.map((bar) => [bar.date, bar.close] as const));
  const revalidateFrom = stockholmDateOffset(latestComplete, -(NORDIC_REVALIDATE_RECENT_DAYS - 1));

  const dates: string[] = [];
  for (let offset = -NORDIC_LIVE_LOOKBACK_DAYS; offset <= 2; offset++) {
    const date = stockholmDateOffset(today, offset);
    if (date > latestComplete) continue;
    const have = cachedByDate.has(date);
    const inRecentBand = date >= revalidateFrom;
    if (!have || inRecentBand) dates.push(date);
  }
  return { latestComplete, dates };
}

async function loadNordicSysDailyHistory(now: Date): Promise<NordicSysBar[]> {
  const cached = memory.bars ?? readDisk();
  const { latestComplete, dates } = selectNordicFetchDates(cached, now);

  const liveRows =
    dates.length === 0
      ? []
      : await mapLimited(dates, CONCURRENCY, fetchSysDay);
  const live = liveRows.filter((row): row is NordicSysBar => row != null);
  const merged = mergeBars(cached, live).filter((bar) => bar.date <= latestComplete);

  if (merged.length > 0) {
    const sameLength = merged.length === cached.length;
    const same =
      sameLength &&
      merged.every((bar, i) => bar.date === cached[i]?.date && bar.close === cached[i]?.close);
    if (!same) writeDisk(merged);
  }

  memory.bars = merged;
  memory.fetchedAt = Date.now();
  return merged;
}

/**
 * Load Nordic SYS daily averages: merge durable cache with an incremental live fetch
 * (missing dates + recent revalidation). Process-wide inflight + short memory share
 * the same dataset across Overview, Indicators, and Signals.
 */
export async function fetchNordicSysDailyHistory(now = new Date()): Promise<NordicSysBar[]> {
  if (memory.bars && Date.now() - memory.fetchedAt < MEMORY_TTL_MS) {
    return memory.bars;
  }
  if (inflight) return inflight;

  inflight = loadNordicSysDailyHistory(now).finally(() => {
    inflight = null;
  });
  return inflight;
}
