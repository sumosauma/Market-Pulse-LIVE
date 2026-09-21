import { createServerFn } from "@tanstack/react-start";
import type { GetUkYieldHistoryResponse, ParsedUkBankOfEnglandHistory } from "./types";
import { fetchUkBankOfEnglandHistory } from "./fetchUkBankOfEnglandHistory";
import { isUkHistoryCacheFresh } from "./ukHistoryCache";

const LOG = "[GB_CURVE]";
const UK_HISTORY_CACHE_PATH = "data/cache/gb-boe-yield-history.json";

type DiskEnvelope = { savedAt: string; history: ParsedUkBankOfEnglandHistory };

function saveUkHistoryDisk(history: ParsedUkBankOfEnglandHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(UK_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(UK_HISTORY_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${UK_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadUkHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(UK_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(UK_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleUkHistory(
  forceRefresh: boolean,
): Promise<{ history: ParsedUkBankOfEnglandHistory; fetchedLive: boolean; cacheSavedAtISO: string }> {
  if (!forceRefresh) {
    const cached = loadUkHistoryDiskEnvelope();
    if (cached && isUkHistoryCacheFresh(cached.savedAt)) {
      console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt} (skipping Bank of England)`);
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
  }

  const cached = loadUkHistoryDiskEnvelope();

  try {
    console.log(`${LOG} Fetching Bank of England history (forceRefresh=${forceRefresh})`);
    const history = await fetchUkBankOfEnglandHistory(cached?.history ?? null);
    const cacheSavedAtISO = saveUkHistoryDisk(history);
    return { history, fetchedLive: true, cacheSavedAtISO };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    if (cached?.history?.series?.length) {
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
    throw e;
  }
}

export interface UkYieldHistoryInput {
  forceRefresh?: boolean;
}

/** Server loader — returns cached BoE history; comparison is built client-side. */
export const getUkBankOfEnglandYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: UkYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetUkYieldHistoryResponse> => {
    const forceRefresh = Boolean(data?.forceRefresh);
    const updatedAtIso = new Date().toISOString();

    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleUkHistory(forceRefresh);
      const tag = fetchedLive ? ("boe-live" as const) : ("boe-disk-cache" as const);
      const loaded = history.series.length;
      const expected = 7;
      const partialNote =
        loaded < expected || (history.failedMaturities?.length ?? 0) > 0
          ? "Some UK maturities are temporarily unavailable from the Bank of England."
          : null;

      console.log(`${LOG} Data source used: ${tag} series=${loaded}/${expected}`);

      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached Bank of England data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No Bank of England history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "United Kingdom yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });
