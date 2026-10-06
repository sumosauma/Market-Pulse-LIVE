import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { fetchGermanyBundesbankHistory } from "./bundesbankSvensson";
import { fetchEuropeTradingViewCurrent, type EuropeTradingViewCurrent } from "./europeTradingViewCurve";
import { isGermanyHistoryCacheFresh } from "./germanyHistoryCache";
import type { GetGermanyYieldHistoryResponse, ParsedGermanyBundesbankHistory } from "./types";

const LOG = "[DE_CURVE]";
const DE_HISTORY_CACHE_PATH = "data/cache/de-bundesbank-yield-history.json";

type DiskEnvelope = { savedAt: string; history: ParsedGermanyBundesbankHistory };

function saveGermanyHistoryDisk(history: ParsedGermanyBundesbankHistory): string {
  const savedAt = new Date().toISOString();
  try {
    const dir = dirname(DE_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, history };
    writeFileSync(DE_HISTORY_CACHE_PATH, JSON.stringify(env), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${DE_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadGermanyHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    if (!existsSync(DE_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(DE_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleGermanyHistory(forceRefresh: boolean): Promise<{
  history: ParsedGermanyBundesbankHistory;
  fetchedLive: boolean;
  cacheSavedAtISO: string;
}> {
  if (!forceRefresh) {
    const cached = loadGermanyHistoryDiskEnvelope();
    if (cached && isGermanyHistoryCacheFresh(cached.savedAt)) {
      console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt}`);
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
  }

  try {
    console.log(`${LOG} Fetching Bundesbank Svensson history (forceRefresh=${forceRefresh})`);
    const history = await fetchGermanyBundesbankHistory();
    const cacheSavedAtISO = saveGermanyHistoryDisk(history);
    return { history, fetchedLive: true, cacheSavedAtISO };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Live fetch failed — ${msg}`);
    const cached = loadGermanyHistoryDiskEnvelope();
    if (cached?.history?.series?.length) {
      return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
    }
    throw e;
  }
}

export interface GermanyYieldHistoryInput {
  forceRefresh?: boolean;
}

export const getGermanyBundesbankYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: GermanyYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetGermanyYieldHistoryResponse> => {
    const updatedAtIso = new Date().toISOString();
    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleGermanyHistory(Boolean(data?.forceRefresh));
      const loaded = history.series.length;
      const partialNote =
        loaded < 8 || (history.failedMaturities?.length ?? 0) > 0
          ? "Some German maturities are temporarily unavailable from the Bundesbank."
          : null;
      const tag = fetchedLive ? ("bundesbank-live" as const) : ("bundesbank-disk-cache" as const);
      console.log(`${LOG} Data source used: ${tag} series=${loaded}/8 latest=${history.latestDate ?? "none"}`);
      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached Bundesbank data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No Bundesbank history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "Germany yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });

export type GetGermanyTradingViewYieldsResponse = Readonly<{
  current: EuropeTradingViewCurrent | null;
  errorMessage: string | null;
}>;

/** Whole-curve fallback. Called only after the official Bundesbank history is unavailable. */
export const getGermanyTradingViewYields = createServerFn({ method: "GET" }).handler(
  async (): Promise<GetGermanyTradingViewYieldsResponse> => {
    try {
      const current = await fetchEuropeTradingViewCurrent("DE");
      if (!current) {
        return { current: null, errorMessage: "TradingView Germany government bond yields unavailable." };
      }
      console.log(
        `${LOG} TradingView fallback ${current.quotes.length}/8 ` +
          current.quotes.map((q) => `${q.maturity}=${q.yieldPct.toFixed(2)}`).join(" "),
      );
      return { current, errorMessage: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} TradingView fallback failed — ${msg}`);
      return { current: null, errorMessage: "TradingView Germany government bond yields unavailable." };
    }
  },
);
