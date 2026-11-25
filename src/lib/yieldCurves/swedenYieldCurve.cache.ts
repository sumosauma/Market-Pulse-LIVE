import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GetSwedenYieldHistoryResponse, ParsedSwedenRiksbankHistory } from "./types";
import { fetchSwedenDiHistory, SWEDEN_DI_SERIES, SWEDEN_SWEA_BILL_SERIES } from "./fetchSwedenDiCurve";
import { SE_HISTORY_CACHE_TTL_MS, isSwedenHistoryCacheFresh } from "./swedenHistoryCache";

const LOG = "[SE_CURVE]";
const SE_HISTORY_CACHE_PATH = "data/cache/se-yield-history-v2.json";

type DiskEnvelope = { savedAt: string; history: ParsedSwedenRiksbankHistory };

type SwedenAssembleResult = {
  history: ParsedSwedenRiksbankHistory;
  fetchedLive: boolean;
  cacheSavedAtISO: string;
  fromStaleCache: boolean;
};

const memory: { savedAt: number; history: ParsedSwedenRiksbankHistory | null } = {
  savedAt: 0,
  history: null,
};

let liveInflight: Promise<SwedenAssembleResult> | null = null;

function saveSwedenHistoryDisk(history: ParsedSwedenRiksbankHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const dir = dirname(SE_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(SE_HISTORY_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${SE_HISTORY_CACHE_PATH}`);
  } catch (err) {
    console.log(
      `${LOG} Persistent history cache write skipped (${err instanceof Error ? err.message : "read-only filesystem or Workers"})`,
    );
  }
  memory.savedAt = Date.parse(savedAt);
  memory.history = history;
  return savedAt;
}

function loadSwedenHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    if (!existsSync(SE_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(SE_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

function hydrateMemoryFromDisk(): DiskEnvelope | null {
  if (memory.history?.series?.length) {
    return { savedAt: new Date(memory.savedAt).toISOString(), history: memory.history };
  }
  const disk = loadSwedenHistoryDiskEnvelope();
  if (!disk) return null;
  memory.history = disk.history;
  memory.savedAt = Date.parse(disk.savedAt);
  return disk;
}

async function fetchSwedenLive(): Promise<SwedenAssembleResult> {
  if (liveInflight) return liveInflight;
  liveInflight = (async () => {
    try {
      console.log(`${LOG} Fetching DI bonds + SWEA bills`);
      const history = await fetchSwedenDiHistory();
      const cacheSavedAtISO = saveSwedenHistoryDisk(history);
      return {
        history,
        fetchedLive: true,
        cacheSavedAtISO,
        fromStaleCache: false,
      };
    } finally {
      liveInflight = null;
    }
  })();
  return liveInflight;
}

function kickSwedenBackground(): void {
  void fetchSwedenLive().catch((err) => {
    console.log(
      `${LOG} Background refresh failed — keeping prior cache (${err instanceof Error ? err.message : err})`,
    );
  });
}

async function assembleSwedenHistory(forceRefresh: boolean): Promise<SwedenAssembleResult> {
  if (forceRefresh) {
    try {
      return await fetchSwedenLive();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} Forced live fetch failed — ${msg}`);
      const cached = hydrateMemoryFromDisk();
      if (cached?.history?.series?.length) {
        return {
          history: cached.history,
          fetchedLive: false,
          cacheSavedAtISO: cached.savedAt,
          fromStaleCache: true,
        };
      }
      throw e;
    }
  }

  const cached = hydrateMemoryFromDisk();
  if (cached && isSwedenHistoryCacheFresh(cached.savedAt)) {
    console.log(`${LOG} Using fresh disk/memory cache savedAt=${cached.savedAt} (skipping live fetch)`);
    return {
      history: cached.history,
      fetchedLive: false,
      cacheSavedAtISO: cached.savedAt,
      fromStaleCache: false,
    };
  }

  if (cached?.history?.series?.length) {
    console.log(
      `${LOG} Serving expired disk cache savedAt=${cached.savedAt} (TTL=${SE_HISTORY_CACHE_TTL_MS}ms) + background refresh`,
    );
    kickSwedenBackground();
    return {
      history: cached.history,
      fetchedLive: false,
      cacheSavedAtISO: cached.savedAt,
      fromStaleCache: true,
    };
  }

  try {
    return await fetchSwedenLive();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    throw e;
  }
}

function toResponse(
  result: SwedenAssembleResult,
  updatedAtISO: string,
): GetSwedenYieldHistoryResponse {
  const tag = result.fetchedLive ? ("di-live" as const) : ("di-disk-cache" as const);
  const loaded = result.history.series.length;
  const expected = SWEDEN_DI_SERIES.length + SWEDEN_SWEA_BILL_SERIES.length;
  const partialNote =
    loaded < expected || (result.history.failedMaturities?.length ?? 0) > 0
      ? "Some Swedish maturities are temporarily unavailable."
      : null;

  console.log(
    `${LOG} Data source used: ${tag} series=${loaded}/${expected} fromStale=${result.fromStaleCache}`,
  );

  return {
    history: result.history,
    errorMessage: result.fetchedLive
      ? partialNote
      : (partialNote ?? "Using cached DI data (server disk)"),
    dataSourceTag: tag,
    updatedAtISO,
    cacheSavedAtISO: result.cacheSavedAtISO,
    fromStaleCache: result.fromStaleCache,
  };
}

export async function getCachedSwedenYieldHistory(
  forceRefresh = false,
): Promise<GetSwedenYieldHistoryResponse> {
  const updatedAtISO = new Date().toISOString();
  try {
    const assembled = await assembleSwedenHistory(forceRefresh);
    return toResponse(assembled, updatedAtISO);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} No DI history available (live + cache): ${msg}`);
    return {
      history: null,
      errorMessage: "Sweden yield curve data unavailable.",
      dataSourceTag: "unavailable",
      updatedAtISO,
      cacheSavedAtISO: null,
      fromStaleCache: false,
    };
  }
}

export function loadSwedenYieldHistoryForAudit(
  forceRefresh = false,
): Promise<GetSwedenYieldHistoryResponse> {
  return getCachedSwedenYieldHistory(forceRefresh);
}

export function clearSwedenYieldSwrMemoryForAudit(): void {
  memory.savedAt = 0;
  memory.history = null;
}
