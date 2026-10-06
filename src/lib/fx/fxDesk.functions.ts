import { createServerFn } from "@tanstack/react-start";
import { fetchYahooDailyCloses } from "@/lib/derivatives/dailyCloses";
import { fetchDiInstrumentHistory, normalizeDiPointsToDailyEod, trimRowsToLookback } from "@/lib/di/diInstrumentHistory";
import { SWEDEN_DI_SERIES } from "@/lib/yieldCurves/fetchSwedenDiCurve";
import { addYearsISO, todayISO } from "./dates";
import { fetchTimeseries, pointsFromTimeseries } from "./frankfurter";
import type { FxDeskMarket, FxYieldHistory } from "./desk";
import type { FxPoint } from "./types";

const USD_QUOTES = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK"] as const;

const FACTORS: Record<string, string> = {
  vix: "^VIX",
  spx: "^GSPC",
  stoxx: "^STOXX50E",
  omx: "^OMX",
  brent: "BZ=F",
  gold: "GC=F",
  dxy: "DX-Y.NYB",
};

const FRED_SERIES = { us2y: "DGS2", us10y: "DGS10" } as const;
const SE_LOOKBACK_DAYS = 420;

export type FxPositionRow = {
  currency: string;
  net: number;
  weeklyChange: number | null;
  percentile1y: number | null;
  reportDate: string;
};

export type FxPositioningPayload = {
  fetchedAt: string;
  reportDate: string | null;
  source: string;
  rows: FxPositionRow[];
};

let marketInflight: Promise<FxDeskMarket> | null = null;
let marketCache: { at: number; data: FxDeskMarket } | null = null;
let yieldInflight: Promise<FxYieldHistory> | null = null;
let yieldCache: { at: number; data: FxYieldHistory } | null = null;
let cotInflight: Promise<FxPositioningPayload> | null = null;
let cotCache: { at: number; data: FxPositioningPayload } | null = null;

const MARKET_TTL_MS = 15 * 60 * 1000;
const YIELD_TTL_MS = 30 * 60 * 1000;
const COT_TTL_MS = 12 * 60 * 60 * 1000;

async function fredPoints(seriesId: string): Promise<FxPoint[]> {
  const end = todayISO();
  const start = addYearsISO(end, -2);
  const url =
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}` +
    `&cosd=${start}&coed=${end}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "text/csv,*/*" },
  });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const text = await res.text();
  if (text.startsWith("<")) throw new Error(`FRED ${seriesId} returned HTML`);
  const points: FxPoint[] = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const comma = line.indexOf(",");
    if (comma <= 0) continue;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw || raw === ".") continue;
    const close = Number.parseFloat(raw);
    if (Number.isFinite(close)) points.push({ date, close });
  }
  if (points.length < 30) throw new Error(`FRED ${seriesId} returned ${points.length} points`);
  return points;
}

async function swedenTenor(maturity: "2Y" | "10Y"): Promise<FxPoint[]> {
  const spec = SWEDEN_DI_SERIES.find((row) => row.maturity === maturity);
  if (!spec) throw new Error(`Sweden ${maturity} series is not configured`);
  const hist = await fetchDiInstrumentHistory(spec.insref);
  return trimRowsToLookback(normalizeDiPointsToDailyEod(hist.points), SE_LOOKBACK_DAYS).map((row) => ({
    date: row.date,
    close: row.value,
  }));
}

async function loadMarket(): Promise<FxDeskMarket> {
  if (marketCache && Date.now() - marketCache.at < MARKET_TTL_MS) return marketCache.data;
  if (marketInflight) return marketInflight;
  marketInflight = (async () => {
    const end = todayISO();
    const start = addYearsISO(end, -2);
    const series = await fetchTimeseries(start, end, "USD", USD_QUOTES);
    const usdQuotes: Record<string, FxPoint[]> = {};
    for (const currency of USD_QUOTES) {
      usdQuotes[currency] = pointsFromTimeseries(series, currency);
    }
    const factorEntries = await Promise.all(
      Object.entries(FACTORS).map(async ([key, ticker]) => {
        try {
          const points = await fetchYahooDailyCloses(ticker);
          return [key, points] as const;
        } catch (err) {
          console.warn(`[FX desk] factor ${ticker} unavailable`, err instanceof Error ? err.message : err);
          return [key, [] as FxPoint[]] as const;
        }
      }),
    );
    const dates = usdQuotes.EUR ?? [];
    const data: FxDeskMarket = {
      fetchedAt: new Date().toISOString(),
      asOf: dates.length ? dates[dates.length - 1]!.date : series.end_date ?? null,
      usdQuotes,
      factors: Object.fromEntries(factorEntries),
    };
    marketCache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    marketInflight = null;
  });
  return marketInflight;
}

async function loadYields(): Promise<FxYieldHistory> {
  if (yieldCache && Date.now() - yieldCache.at < YIELD_TTL_MS) return yieldCache.data;
  if (yieldInflight) return yieldInflight;
  yieldInflight = (async () => {
    const [us2y, us10y, se2y, se10y] = await Promise.all([
      fredPoints(FRED_SERIES.us2y),
      fredPoints(FRED_SERIES.us10y),
      swedenTenor("2Y"),
      swedenTenor("10Y"),
    ]);
    const data: FxYieldHistory = {
      fetchedAt: new Date().toISOString(),
      us2y,
      us10y,
      se2y,
      se10y,
      usSource: "FRED Treasury CMT",
      seSource: "Sweden DI benchmark",
    };
    yieldCache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    yieldInflight = null;
  });
  return yieldInflight;
}

const COT_MARKETS = [
  { currency: "EUR", name: "EURO FX - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "GBP", name: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "JPY", name: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "CHF", name: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "CAD", name: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "AUD", name: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
  { currency: "NZD", name: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
] as const;

type CotApiRow = {
  report_date_as_yyyy_mm_dd?: string;
  market_and_exchange_names?: string;
  lev_money_positions_long?: string;
  lev_money_positions_short?: string;
};

function percentileOf(values: readonly number[], current: number): number | null {
  const window = values.slice(-52);
  if (window.length < 40 || !Number.isFinite(current)) return null;
  let count = 0;
  for (const value of window) if (value <= current) count += 1;
  return (count / window.length) * 100;
}

async function loadPositioning(): Promise<FxPositioningPayload> {
  if (cotCache && Date.now() - cotCache.at < COT_TTL_MS) return cotCache.data;
  if (cotInflight) return cotInflight;
  cotInflight = (async () => {
    const quoted = COT_MARKETS.map((row) => `'${row.name}'`).join(",");
    const url =
      "https://publicreporting.cftc.gov/resource/gpe5-46if.json" +
      "?$select=report_date_as_yyyy_mm_dd,market_and_exchange_names,lev_money_positions_long,lev_money_positions_short" +
      `&$where=market_and_exchange_names in(${quoted})` +
      "&$order=report_date_as_yyyy_mm_dd DESC&$limit=490";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
    const json = (await res.json()) as CotApiRow[];
    if (!Array.isArray(json) || json.length === 0) throw new Error("CFTC returned no rows");

    const byName = new Map<string, { date: string; net: number }[]>();
    for (const row of json) {
      const name = row.market_and_exchange_names;
      const date = row.report_date_as_yyyy_mm_dd?.slice(0, 10);
      const long = Number(row.lev_money_positions_long);
      const short = Number(row.lev_money_positions_short);
      if (!name || !date || !Number.isFinite(long) || !Number.isFinite(short)) continue;
      const list = byName.get(name) ?? [];
      list.push({ date, net: long - short });
      byName.set(name, list);
    }

    const rows: FxPositionRow[] = [];
    for (const market of COT_MARKETS) {
      const history = (byName.get(market.name) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const latest = history[history.length - 1];
      if (!latest) continue;
      const previous = history[history.length - 2];
      rows.push({
        currency: market.currency,
        net: latest.net,
        weeklyChange: previous ? latest.net - previous.net : null,
        percentile1y: percentileOf(history.map((point) => point.net), latest.net),
        reportDate: latest.date,
      });
    }
    if (!rows.length) throw new Error("CFTC currency contracts were not in the response");
    const data: FxPositioningPayload = {
      fetchedAt: new Date().toISOString(),
      reportDate: rows[0]?.reportDate ?? null,
      source: "CFTC Traders in Financial Futures, futures only, leveraged funds",
      rows,
    };
    cotCache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    cotInflight = null;
  });
  return cotInflight;
}

export const getFxDeskMarket = createServerFn({ method: "GET" }).handler(async () => loadMarket());

export const getFxYieldHistory = createServerFn({ method: "GET" }).handler(async () => loadYields());

export const getFxPositioning = createServerFn({ method: "GET" }).handler(async () => loadPositioning());
