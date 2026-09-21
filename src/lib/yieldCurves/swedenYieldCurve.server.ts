import { createServerFn } from "@tanstack/react-start";
import type { GetSwedenYieldHistoryResponse, ParsedSwedenRiksbankHistory } from "./types";
import { fetchSwedenDiHistory, SWEDEN_DI_SERIES, SWEDEN_SWEA_BILL_SERIES } from "./fetchSwedenDiCurve";
import { isSwedenHistoryCacheFresh } from "./swedenHistoryCache";

const LOG = "[SE_CURVE]";
const SE_HISTORY_CACHE_PATH = "data/cache/se-yield-history-v2.json";

type DiskEnvelope = { savedAt: string; history: ParsedSwedenRiksbankHistory };

function saveSwedenHistoryDisk(history: ParsedSwedenRiksbankHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(SE_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(SE_HISTORY_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${SE_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadSwedenHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(SE_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(SE_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleSwedenHistory(
  forceRefresh: boolean,
): Promise<{ history: ParsedSwedenRiksbankHistory; fetchedLive: boolean; cacheSavedAtISO: string }> {
  if (!forceRefresh) {
    const cached = loadSwedenHistoryDiskEnvelope();
    if (cached && isSwedenHistoryCacheFresh(cached.savedAt)) {
      console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt} (skipping live fetch)`);
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
  }

  try {
    console.log(`${LOG} Fetching DI bonds + SWEA bills (forceRefresh=${forceRefresh})`);
    const history = await fetchSwedenDiHistory();
    const cacheSavedAtISO = saveSwedenHistoryDisk(history);
    return { history, fetchedLive: true, cacheSavedAtISO };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    const cached = loadSwedenHistoryDiskEnvelope();
    if (cached?.history?.series?.length) {
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
    throw e;
  }
}

export interface SwedenYieldHistoryInput {
  forceRefresh?: boolean;
}

/** Server loader — returns cached DI history; comparison is built client-side. */
export const getSwedenYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: SwedenYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetSwedenYieldHistoryResponse> => {
    const forceRefresh = Boolean(data?.forceRefresh);
    const updatedAtIso = new Date().toISOString();

    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleSwedenHistory(forceRefresh);
      const tag = fetchedLive ? ("di-live" as const) : ("di-disk-cache" as const);
      const loaded = history.series.length;
      const expected = SWEDEN_DI_SERIES.length + SWEDEN_SWEA_BILL_SERIES.length;
      const partialNote =
        loaded < expected || (history.failedMaturities?.length ?? 0) > 0
          ? "Some Swedish maturities are temporarily unavailable."
          : null;

      console.log(`${LOG} Data source used: ${tag} series=${loaded}/${expected}`);

      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached DI data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No DI history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "Sweden yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });

/** @deprecated Use getSwedenYieldHistory */
export const getSwedenRiksbankYieldHistory = getSwedenYieldHistory;

/** @deprecated Use getSwedenYieldHistory */
export const getSwedenRiksbankYieldCurve = getSwedenYieldHistory;
