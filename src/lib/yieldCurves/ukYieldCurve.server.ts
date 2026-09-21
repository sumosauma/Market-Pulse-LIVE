import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { fetchTradingViewSymbolFields } from "../derivatives/tradingviewScanner";
import type { GetUkYieldHistoryResponse, ParsedUkBankOfEnglandHistory } from "./types";
import { YIELD_CURVE_MATURITIES } from "./types";
import { BOE_HARMONIZED_GRID_TARGETS } from "./boeGiltNominalSpotParse";
import { fetchUkBankOfEnglandHistory } from "./fetchUkBankOfEnglandHistory";
import { isUkHistoryCacheFresh } from "./ukHistoryCache";
import {
  tradingViewPastYield,
  UK_TRADINGVIEW_SYMBOLS,
  type UkTradingViewCurrent,
  type UkTradingViewHistoryPeriod,
} from "./ukTradingViewCurve";

const TV_HISTORY_FIELDS = "close,prev_close_price,change,Perf.W,Perf.1M,Perf.3M,Perf.Y";

const LOG = "[GB_CURVE]";
const UK_HISTORY_CACHE_PATH = "data/cache/gb-boe-yield-history.json";

type DiskEnvelope = { savedAt: string; history: ParsedUkBankOfEnglandHistory };

function saveUkHistoryDisk(history: ParsedUkBankOfEnglandHistory): string {
  const savedAt = new Date().toISOString();
  try {
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

export type GetUkTradingViewYieldsResponse = Readonly<{
  current: UkTradingViewCurrent | null;
  errorMessage: string | null;
}>;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Live UK benchmark yields plus same-symbol TradingView history. Does not call the Bank of England. */
export async function fetchUkTradingViewCurrent(): Promise<UkTradingViewCurrent | null> {
  const settled = await Promise.all(
    YIELD_CURVE_MATURITIES.map(async (maturity) => {
      const symbol = UK_TRADINGVIEW_SYMBOLS[maturity];
      const row = await fetchTradingViewSymbolFields(symbol, TV_HISTORY_FIELDS);
      const close = finiteNumber(row?.close);
      if (close == null) return null;
      const prevClose = finiteNumber(row?.prev_close_price);
      const oneDay =
        prevClose != null && prevClose > 0 ? prevClose : tradingViewPastYield(close, finiteNumber(row?.change));
      const history: Partial<Record<UkTradingViewHistoryPeriod, number>> = {};
      if (oneDay != null) history["1D"] = oneDay;
      const week = tradingViewPastYield(close, finiteNumber(row?.["Perf.W"]));
      const month = tradingViewPastYield(close, finiteNumber(row?.["Perf.1M"]));
      const threeMonth = tradingViewPastYield(close, finiteNumber(row?.["Perf.3M"]));
      const year = tradingViewPastYield(close, finiteNumber(row?.["Perf.Y"]));
      if (week != null) history["1W"] = week;
      if (month != null) history["1M"] = month;
      if (threeMonth != null) history["3M"] = threeMonth;
      if (year != null) history["1Y"] = year;
      return {
        maturity,
        symbol,
        yieldPct: close,
        prevClose: oneDay,
        history,
      };
    }),
  );
  const quotes = settled.filter((row): row is NonNullable<typeof row> => row != null);
  if (!quotes.length) {
    console.log(`${LOG} TradingView current curve unavailable`);
    return null;
  }
  console.log(
    `${LOG} TradingView current ${quotes.length}/${YIELD_CURVE_MATURITIES.length} ` +
      quotes.map((q) => `${q.maturity}=${q.yieldPct.toFixed(2)}`).join(" "),
  );
  return { fetchedAt: new Date().toISOString(), quotes };
}

export const getUkTradingViewYields = createServerFn({ method: "GET" }).handler(
  async (): Promise<GetUkTradingViewYieldsResponse> => {
    try {
      const current = await fetchUkTradingViewCurrent();
      return {
        current,
        errorMessage: current ? null : "TradingView UK government bond yields unavailable.",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${LOG} TradingView fetch failed — ${msg}`);
      return { current: null, errorMessage: "TradingView UK government bond yields unavailable." };
    }
  },
);

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
      const expected = BOE_HARMONIZED_GRID_TARGETS.length;
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
