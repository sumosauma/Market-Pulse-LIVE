import { createServerFn } from "@tanstack/react-start";
import type { GetChinaYieldHistoryResponse, ParsedChinaChinaBondHistory } from "./types";
import { fetchChinaChinaBondHistory } from "./fetchChinaChinaBondCurve";
import { isChinaHistoryCacheFresh } from "./chinaHistoryCache";

const LOG = "[CN_CURVE]";
const CN_HISTORY_CACHE_PATH = "data/cache/cn-chinabond-yield-history.json";

type DiskEnvelope = { savedAt: string; history: ParsedChinaChinaBondHistory };

function saveChinaHistoryDisk(history: ParsedChinaChinaBondHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(CN_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(CN_HISTORY_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${CN_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadChinaHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(CN_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(CN_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleChinaHistory(
  forceRefresh: boolean,
): Promise<{ history: ParsedChinaChinaBondHistory; fetchedLive: boolean; cacheSavedAtISO: string }> {
  if (!forceRefresh) {
    const cached = loadChinaHistoryDiskEnvelope();
    if (cached && isChinaHistoryCacheFresh(cached.savedAt)) {
      console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt} (skipping ChinaBond)`);
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
  }

  try {
    console.log(`${LOG} Fetching ChinaBond history (forceRefresh=${forceRefresh})`);
    const history = await fetchChinaChinaBondHistory();
    const cacheSavedAtISO = saveChinaHistoryDisk(history);
    return { history, fetchedLive: true, cacheSavedAtISO };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    const cached = loadChinaHistoryDiskEnvelope();
    if (cached?.history?.series?.length) {
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
    throw e;
  }
}

export interface ChinaYieldHistoryInput {
  forceRefresh?: boolean;
}

/** Server loader — returns cached ChinaBond history; comparison is built client-side. */
export const getChinaChinaBondYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: ChinaYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetChinaYieldHistoryResponse> => {
    const forceRefresh = Boolean(data?.forceRefresh);
    const updatedAtIso = new Date().toISOString();

    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleChinaHistory(forceRefresh);
      const tag = fetchedLive ? ("chinabond-live" as const) : ("chinabond-disk-cache" as const);
      const loaded = history.series.length;
      const expected = 7;
      const partialNote =
        loaded < expected || (history.failedMaturities?.length ?? 0) > 0
          ? "Some Chinese maturities are temporarily unavailable from ChinaBond."
          : null;

      console.log(`${LOG} Data source used: ${tag} series=${loaded}/${expected}`);

      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached ChinaBond data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No ChinaBond history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "China yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });
