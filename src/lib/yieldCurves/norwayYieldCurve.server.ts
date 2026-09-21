import { createServerFn } from "@tanstack/react-start";
import type { GetNorwayYieldHistoryResponse, ParsedNorwayNorgesBankHistory } from "./types";
import { fetchNorwayNorgesBankHistory } from "./fetchNorwayNorgesBankCurve";
import { isNorwayHistoryCacheFresh } from "./norwayHistoryCache";

const LOG = "[NO_CURVE]";
const NO_HISTORY_CACHE_PATH = "data/cache/no-norgesbank-yield-history.json";

type DiskEnvelope = { savedAt: string; history: ParsedNorwayNorgesBankHistory };

function saveNorwayHistoryDisk(history: ParsedNorwayNorgesBankHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(NO_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(NO_HISTORY_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${NO_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadNorwayHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(NO_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(NO_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleNorwayHistory(
  forceRefresh: boolean,
): Promise<{ history: ParsedNorwayNorgesBankHistory; fetchedLive: boolean; cacheSavedAtISO: string }> {
  if (!forceRefresh) {
    const cached = loadNorwayHistoryDiskEnvelope();
    if (cached && isNorwayHistoryCacheFresh(cached.savedAt)) {
      console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt} (skipping Norges Bank)`);
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
  }

  try {
    console.log(`${LOG} Fetching Norges Bank history (forceRefresh=${forceRefresh})`);
    const history = await fetchNorwayNorgesBankHistory();
    const cacheSavedAtISO = saveNorwayHistoryDisk(history);
    return { history, fetchedLive: true, cacheSavedAtISO };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    const cached = loadNorwayHistoryDiskEnvelope();
    if (cached?.history?.series?.length) {
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
    throw e;
  }
}

export interface NorwayYieldHistoryInput {
  forceRefresh?: boolean;
}

/** Server loader — returns cached Norges Bank history; comparison is built client-side. */
export const getNorwayNorgesBankYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: NorwayYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetNorwayYieldHistoryResponse> => {
    const forceRefresh = Boolean(data?.forceRefresh);
    const updatedAtIso = new Date().toISOString();

    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleNorwayHistory(forceRefresh);
      const tag = fetchedLive ? ("norgesbank-live" as const) : ("norgesbank-disk-cache" as const);
      const loaded = history.series.length;
      const expected = 6;
      const partialNote =
        loaded < expected || (history.failedMaturities?.length ?? 0) > 0
          ? "Some Norwegian maturities are temporarily unavailable from Norges Bank."
          : null;

      console.log(`${LOG} Data source used: ${tag} series=${loaded}/${expected}`);

      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached Norges Bank data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No Norges Bank history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "Norway yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });
