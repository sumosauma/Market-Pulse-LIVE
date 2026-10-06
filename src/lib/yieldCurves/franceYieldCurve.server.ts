import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { fetchFranceTecHistory } from "./banqueDeFranceTec";
import { fetchEuropeTradingViewCurrent, type EuropeTradingViewCurrent } from "./europeTradingViewCurve";
import { isFranceHistoryCacheFresh } from "./franceHistoryCache";
import type { GetFranceYieldHistoryResponse, ParsedFranceTecHistory } from "./types";

const LOG = "[FR_CURVE]";
const FR_HISTORY_CACHE_PATH = "data/cache/fr-tec-yield-history.json";

type DiskEnvelope = {
  savedAt: string;
  exportUrl: string | null;
  history: ParsedFranceTecHistory;
};

function saveFranceHistoryDisk(history: ParsedFranceTecHistory, exportUrl: string | null): string {
  const savedAt = new Date().toISOString();
  try {
    const dir = dirname(FR_HISTORY_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt, exportUrl, history };
    writeFileSync(FR_HISTORY_CACHE_PATH, JSON.stringify(env), "utf8");
    console.log(`${LOG} Wrote persistent history cache → ${FR_HISTORY_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent history cache write skipped (read-only filesystem or Workers)`);
  }
  return savedAt;
}

function loadFranceHistoryDiskEnvelope(): DiskEnvelope | null {
  try {
    if (!existsSync(FR_HISTORY_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(FR_HISTORY_CACHE_PATH, "utf8")) as DiskEnvelope;
    if (!env?.history?.series?.length) return null;
    return env;
  } catch {
    return null;
  }
}

async function assembleFranceHistory(forceRefresh: boolean): Promise<{
  history: ParsedFranceTecHistory;
  fetchedLive: boolean;
  cacheSavedAtISO: string;
}> {
  const cached = loadFranceHistoryDiskEnvelope();
  if (!forceRefresh && cached && isFranceHistoryCacheFresh(cached.savedAt)) {
    console.log(`${LOG} Using fresh disk cache savedAt=${cached.savedAt}`);
    return { history: cached.history, fetchedLive: false, cacheSavedAtISO: cached.savedAt };
  }

  try {
    console.log(`${LOG} Fetching Banque de France TEC history (forceRefresh=${forceRefresh})`);
    const history = await fetchFranceTecHistory(cached?.exportUrl ?? null);
    const cacheSavedAtISO = saveFranceHistoryDisk(history, history.sourceEndpoint);
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

export interface FranceYieldHistoryInput {
  forceRefresh?: boolean;
}

export const getFranceTecYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: FranceYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetFranceYieldHistoryResponse> => {
    const updatedAtIso = new Date().toISOString();
    try {
      const { history, fetchedLive, cacheSavedAtISO } = await assembleFranceHistory(Boolean(data?.forceRefresh));
      const loaded = history.series.length;
      const partialNote =
        loaded < 5 || (history.failedMaturities?.length ?? 0) > 0
          ? "Some French TEC maturities are temporarily unavailable."
          : null;
      const tag = fetchedLive ? ("bdf-live" as const) : ("bdf-disk-cache" as const);
      console.log(`${LOG} Data source used: ${tag} series=${loaded}/5 latest=${history.latestDate ?? "none"}`);
      return {
        history,
        errorMessage: fetchedLive ? partialNote : partialNote ?? "Using cached Banque de France data (server disk)",
        dataSourceTag: tag,
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} No TEC history available (live + cache): ${msg}`);
      return {
        history: null,
        errorMessage: "France yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
        cacheSavedAtISO: null,
      };
    }
  });

export type GetFranceTradingViewYieldsResponse = Readonly<{
  current: EuropeTradingViewCurrent | null;
  errorMessage: string | null;
}>;

/** Whole-curve fallback. Called only after official TEC history is unavailable. */
export const getFranceTradingViewYields = createServerFn({ method: "GET" }).handler(
  async (): Promise<GetFranceTradingViewYieldsResponse> => {
    try {
      const current = await fetchEuropeTradingViewCurrent("FR");
      if (!current) {
        return { current: null, errorMessage: "TradingView France government bond yields unavailable." };
      }
      console.log(
        `${LOG} TradingView fallback ${current.quotes.length}/8 ` +
          current.quotes.map((q) => `${q.maturity}=${q.yieldPct.toFixed(2)}`).join(" "),
      );
      return { current, errorMessage: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} TradingView fallback failed — ${msg}`);
      return { current: null, errorMessage: "TradingView France government bond yields unavailable." };
    }
  },
);
