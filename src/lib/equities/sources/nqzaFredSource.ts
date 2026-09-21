/**
 * NQZA-only daily history via FRED NASDAQNQZA + Yahoo ^NQZA live quote.
 *
 * Yahoo returns a live price but only one daily bar; FRED supplies daily closes.
 * Easy to remove; not used for any other market.
 */

import { change1dPercentFromDailyHistory } from "../equityDayChange";
import { exchangeTzFromRow } from "../equityExchangeTz";
import { resolveDayHighLow } from "../equityIntradaySession";
import { deriveEquityMarketStatus } from "../equityMarketStatus";
import { fetchNqzaAvanzaIntraday, isBetterNqzaIntraday } from "./nqzaIntradaySource";
import type { EquityHistoryPoint, EquityMarketQuote } from "../types";

export const NQZA_YAHOO_TICKER = "^NQZA";
export const NQZA_COUNTRY_ID = "ZA";
export const NQZA_FRED_SERIES = "NASDAQNQZA";
export const NQZA_SOURCE = "Yahoo Finance / FRED";
export const NQZA_SOURCE_FRED_ONLY = "FRED";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-NQZA/1.0)";
const FRED_HISTORY_YEARS = 2;

type YahooChartResultItem = Readonly<{
  meta?: Readonly<{
    regularMarketPrice?: unknown;
    regularMarketDayLow?: unknown;
    regularMarketDayHigh?: unknown;
    exchangeTimezoneName?: unknown;
    gmtoffset?: unknown;
    timezone?: unknown;
    regularMarketTime?: unknown;
    marketState?: unknown;
  }>;
  timestamp?: readonly number[];
  indicators?: Readonly<{ quote?: ReadonlyArray<{ close?: readonly (number | null)[] }> }>;
}>;

type YahooChartJson = Readonly<{
  chart?: Readonly<{
    result?: readonly YahooChartResultItem[];
    error?: Readonly<{ description?: string }>;
  }>;
}>;

type YahooLiveSnapshot = Readonly<{
  price: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  intraday: EquityHistoryPoint[];
  exchangeTimezoneName: string | null;
  gmtoffset: number | null;
  timezone: string | null;
  regularMarketTime: number | null;
  marketState: string | null;
}>;

function readMetaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fredDateRange(): Readonly<{ cosd: string; coed: string }> {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - FRED_HISTORY_YEARS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { cosd: fmt(from), coed: fmt(to) };
}

function parseFredCsv(csv: string): EquityHistoryPoint[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const points: EquityHistoryPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma <= 0) continue;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    if (!date || raw === "." || raw === "") continue;
    const price = Number.parseFloat(raw);
    if (!Number.isFinite(price)) continue;
    points.push({ date, price });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Fetch NASDAQNQZA daily closes from FRED CSV — never throws. */
export async function fetchNqzaFredDailyHistory(): Promise<EquityHistoryPoint[] | null> {
  try {
    const { cosd, coed } = fredDateRange();
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${NQZA_FRED_SERIES}&cosd=${cosd}&coed=${coed}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
    });
    if (!res.ok) return null;

    const history = parseFredCsv(await res.text());
    return history.length >= 2 ? history : null;
  } catch {
    return null;
  }
}

function downsampleIntraday(points: EquityHistoryPoint[], maxPoints = 90): EquityHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const out: EquityHistoryPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}

function parseYahooIntraday(result: YahooChartResultItem): EquityHistoryPoint[] {
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: EquityHistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") {
      points.push({ date: new Date(ts[i]! * 1000).toISOString(), price: c });
    }
  }
  return points;
}

type YahooChartResult = YahooChartResultItem;

/** Yahoo live price + optional intraday for ^NQZA — never throws. */
async function fetchNqzaYahooLive(): Promise<YahooLiveSnapshot | null> {
  try {
    const [dailyRes, intradayRes] = await Promise.allSettled([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(NQZA_YAHOO_TICKER)}?interval=1d&range=5d`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } },
      ),
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(NQZA_YAHOO_TICKER)}?interval=30m&range=5d`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } },
      ),
    ]);

    let metaResult: YahooChartResult | undefined;

    if (dailyRes.status === "fulfilled" && dailyRes.value.ok) {
      const json = (await dailyRes.value.json()) as YahooChartJson;
      metaResult = json.chart?.result?.[0];
    }

    let intraday: EquityHistoryPoint[] = [];
    if (intradayRes.status === "fulfilled" && intradayRes.value.ok) {
      const json = (await intradayRes.value.json()) as YahooChartJson;
      const intradayChart = json.chart?.result?.[0];
      if (intradayChart) {
        intraday = downsampleIntraday(parseYahooIntraday(intradayChart));
        const intradayMeta = intradayChart.meta;
        if (intradayMeta && (intradayMeta.exchangeTimezoneName || intradayMeta.gmtoffset != null)) {
          metaResult = intradayChart;
        }
      }
    }

    const m = metaResult?.meta ?? {};
    const price = readMetaNumber(m.regularMarketPrice);

    return {
      price,
      dayLow: readMetaNumber(m.regularMarketDayLow),
      dayHigh: readMetaNumber(m.regularMarketDayHigh),
      intraday: intraday.length >= 2 ? intraday : [],
      exchangeTimezoneName: typeof m.exchangeTimezoneName === "string" ? m.exchangeTimezoneName : null,
      gmtoffset: readMetaNumber(m.gmtoffset),
      timezone: typeof m.timezone === "string" ? m.timezone : null,
      regularMarketTime: readMetaNumber(m.regularMarketTime),
      marketState: typeof m.marketState === "string" ? m.marketState : null,
    };
  } catch {
    return null;
  }
}

/**
 * 1D % for NQZA: live Yahoo price vs latest FRED close when live exists;
 * otherwise latest two FRED closes.
 */
export function change1dPercentNqza(
  history: readonly EquityHistoryPoint[],
  livePrice?: number | null,
): number | null {
  const closes = history.map((p) => p.price).filter((p) => Number.isFinite(p));
  if (closes.length < 1) return null;

  if (livePrice != null && Number.isFinite(livePrice)) {
    const priorClose = closes[closes.length - 1]!;
    if (priorClose <= 0) return null;
    return ((livePrice - priorClose) / priorClose) * 100;
  }

  return change1dPercentFromDailyHistory(history, null);
}

function unavailableQuote(countryId: string, error?: string): EquityMarketQuote {
  return {
    countryId,
    price: null,
    changePercent: null,
    status: "unavailable",
    source: NQZA_SOURCE,
    error,
  };
}

export function isNqzaMarket(market: { countryId: string; ticker: string }): boolean {
  return market.countryId === NQZA_COUNTRY_ID || market.ticker === NQZA_YAHOO_TICKER;
}

/** Fetch and merge NQZA from FRED daily history + Yahoo live — never throws. */
export async function fetchNqzaFredYahooQuote(countryId: string): Promise<EquityMarketQuote> {
  if (countryId !== NQZA_COUNTRY_ID) {
    return unavailableQuote(countryId, "Not NQZA");
  }

  try {
    const [fredHistory, yahoo, avanzaIntraday] = await Promise.all([
      fetchNqzaFredDailyHistory(),
      fetchNqzaYahooLive(),
      fetchNqzaAvanzaIntraday(),
    ]);

    if (!fredHistory || fredHistory.length < 2) {
      if (yahoo?.price != null) {
        return unavailableQuote(countryId, "FRED daily history unavailable");
      }
      return unavailableQuote(countryId, "FRED and Yahoo unavailable");
    }

    const yahooLive = yahoo?.price ?? null;
    const price = yahooLive ?? fredHistory[fredHistory.length - 1]!.price;
    const changePercent = change1dPercentNqza(fredHistory, yahooLive);

    if (changePercent == null || !Number.isFinite(changePercent)) {
      return unavailableQuote(countryId, "No usable 1D %");
    }

    const dailyCloses = fredHistory.map((p) => p.price);
    const yahooIntraday = yahoo?.intraday ?? [];
    const intraday =
      avanzaIntraday && isBetterNqzaIntraday(avanzaIntraday, yahooIntraday)
        ? avanzaIntraday
        : yahooIntraday;
    const chartSeries = intraday.length >= 2 ? intraday.map((p) => p.price) : dailyCloses;

    const dayRange = resolveDayHighLow({
      dayLow: yahoo?.dayLow ?? null,
      dayHigh: yahoo?.dayHigh ?? null,
      intraday,
      exchangeTz: exchangeTzFromRow({
        ticker: NQZA_YAHOO_TICKER,
        exchangeTimezoneName: yahoo?.exchangeTimezoneName ?? null,
        gmtoffset: yahoo?.gmtoffset ?? null,
        timezone: yahoo?.timezone ?? null,
      }),
    });

    const useYahooLive = yahooLive != null;
    const status = deriveEquityMarketStatus({
      price,
      changePercent,
      regularMarketTime: useYahooLive ? (yahoo?.regularMarketTime ?? null) : null,
      marketState: useYahooLive ? (yahoo?.marketState ?? null) : null,
      exchangeTimezoneName: yahoo?.exchangeTimezoneName ?? null,
      gmtoffset: yahoo?.gmtoffset ?? null,
      countryId: "ZA",
      region: "Africa",
      ticker: NQZA_YAHOO_TICKER,
    });

    return {
      countryId,
      price,
      changePercent,
      dayLow: dayRange.dayLow,
      dayHigh: dayRange.dayHigh,
      history: fredHistory,
      intraday,
      chartSeries,
      exchangeTimezoneName: yahoo?.exchangeTimezoneName ?? null,
      gmtoffset: yahoo?.gmtoffset ?? null,
      timezone: yahoo?.timezone ?? null,
      status,
      source: useYahooLive ? NQZA_SOURCE : NQZA_SOURCE_FRED_ONLY,
    };
  } catch (e) {
    return unavailableQuote(countryId, e instanceof Error ? e.message : "NQZA fetch failed");
  }
}
