/**
 * NQGI-only quote via Avanza public JSON (orderBookId 155324).
 *
 * Primary: Avanza market-index + intraday + daily charts.
 * Fallback: Yahoo ^NQGI live/intraday, FRED NASDAQNQGI daily history.
 * Easy to remove; not used for any other market.
 */

import { change1dPercentFromDailyHistory } from "../equityDayChange";
import { exchangeTzFromRow } from "../equityExchangeTz";
import { resolveDayHighLow } from "../equityIntradaySession";
import { deriveEquityMarketStatus } from "../equityMarketStatus";
import type { EquityHistoryPoint, EquityMarketQuote } from "../types";

export const NQGI_COUNTRY_ID = "nqgi";
export const NQGI_YAHOO_TICKER = "^NQGI";
export const NQGI_FRED_SERIES = "NASDAQNQGI";
export const NQGI_AVANZA_ORDERBOOK_ID = "155324";
export const NQGI_SOURCE = "Avanza";
export const NQGI_SOURCE_FALLBACK = "Yahoo Finance / FRED";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-NQGI/1.0)";
const FRED_HISTORY_YEARS = 2;
const NQGI_EXCHANGE_TZ = {
  exchangeTimezoneName: "America/New_York",
  gmtoffset: -14400,
  timezone: "EDT",
} as const;

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
}>;

type AvanzaMarketIndexJson = Readonly<{
  name?: string;
  quote?: Readonly<{
    last?: number;
    highest?: number;
    lowest?: number;
    changePercent?: number;
  }>;
  previousClosingPrice?: number;
}>;

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

function readExchangeTz(meta: YahooChartResultItem["meta"]): {
  exchangeTimezoneName: string | null;
  gmtoffset: number | null;
  timezone: string | null;
} {
  return {
    exchangeTimezoneName:
      typeof meta?.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null,
    gmtoffset: readMetaNumber(meta?.gmtoffset),
    timezone: typeof meta?.timezone === "string" ? meta.timezone : null,
  };
}

async function avanzaFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
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

function parseAvanzaDailyHistory(ohlc: readonly AvanzaOhlcBar[]): EquityHistoryPoint[] {
  const points: EquityHistoryPoint[] = [];
  for (const bar of ohlc) {
    if (typeof bar.timestamp !== "number" || typeof bar.close !== "number") continue;
    if (!Number.isFinite(bar.close)) continue;
    points.push({
      date: new Date(bar.timestamp).toISOString().slice(0, 10),
      price: bar.close,
    });
  }
  return points;
}

function parseAvanzaIntraday(ohlc: readonly AvanzaOhlcBar[]): EquityHistoryPoint[] {
  const points: EquityHistoryPoint[] = [];
  for (const bar of ohlc) {
    if (typeof bar.timestamp !== "number" || typeof bar.close !== "number") continue;
    if (!Number.isFinite(bar.close)) continue;
    points.push({
      date: new Date(bar.timestamp).toISOString(),
      price: bar.close,
    });
  }
  return points;
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

async function fetchNqgiFredDailyHistory(): Promise<EquityHistoryPoint[] | null> {
  try {
    const { cosd, coed } = fredDateRange();
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${NQGI_FRED_SERIES}&cosd=${cosd}&coed=${coed}`;
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

async function fetchNqgiYahooLive(): Promise<YahooLiveSnapshot | null> {
  try {
    const [dailyRes, intradayRes] = await Promise.allSettled([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(NQGI_YAHOO_TICKER)}?interval=1d&range=5d`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } },
      ),
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(NQGI_YAHOO_TICKER)}?interval=30m&range=5d`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } },
      ),
    ]);

    let metaResult: YahooChartResultItem | undefined;

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
    const tz = readExchangeTz(m);

    return {
      price: readMetaNumber(m.regularMarketPrice),
      dayLow: readMetaNumber(m.regularMarketDayLow),
      dayHigh: readMetaNumber(m.regularMarketDayHigh),
      intraday: intraday.length >= 2 ? intraday : [],
      exchangeTimezoneName: tz.exchangeTimezoneName,
      gmtoffset: tz.gmtoffset,
      timezone: tz.timezone,
      regularMarketTime: readMetaNumber(m.regularMarketTime),
      marketState: typeof m.marketState === "string" ? m.marketState : null,
    };
  } catch {
    return null;
  }
}

function resolveChangePercent(
  avanzaQuote: AvanzaMarketIndexJson | null,
  price: number,
  history: readonly EquityHistoryPoint[],
): number | null {
  const reported = avanzaQuote?.quote?.changePercent;
  if (reported != null && Number.isFinite(reported)) return reported;

  const previousClose = avanzaQuote?.previousClosingPrice;
  if (previousClose != null && previousClose > 0) {
    return ((price - previousClose) / previousClose) * 100;
  }

  return change1dPercentFromDailyHistory(history, price);
}

function unavailableQuote(countryId: string, error?: string): EquityMarketQuote {
  return {
    countryId,
    price: null,
    changePercent: null,
    status: "unavailable",
    source: NQGI_SOURCE,
    error,
  };
}

export function isNqgiMarket(market: { countryId: string; ticker: string }): boolean {
  return market.countryId === NQGI_COUNTRY_ID || market.ticker === NQGI_YAHOO_TICKER;
}

/** Fetch NQGI from Avanza with Yahoo/FRED fallbacks — never throws. */
export async function fetchNqgiAvanzaQuote(countryId: string): Promise<EquityMarketQuote> {
  if (countryId !== NQGI_COUNTRY_ID) {
    return unavailableQuote(countryId, "Not NQGI");
  }

  try {
    const [avanzaIndex, avanzaIntradayJson, avanzaDailyJson, yahoo, fredHistory] = await Promise.all([
      avanzaFetch<AvanzaMarketIndexJson>(
        `https://www.avanza.se/_api/market-index/${NQGI_AVANZA_ORDERBOOK_ID}`,
      ),
      avanzaFetch<AvanzaPriceChartJson>(
        `https://www.avanza.se/_api/price-chart/stock/${NQGI_AVANZA_ORDERBOOK_ID}?timePeriod=today&resolution=five_minutes`,
      ),
      avanzaFetch<AvanzaPriceChartJson>(
        `https://www.avanza.se/_api/price-chart/stock/${NQGI_AVANZA_ORDERBOOK_ID}?timePeriod=one_year&resolution=day`,
      ),
      fetchNqgiYahooLive(),
      fetchNqgiFredDailyHistory(),
    ]);

    const avanzaIntraday = downsampleIntraday(parseAvanzaIntraday(avanzaIntradayJson?.ohlc ?? []));
    const avanzaDaily = parseAvanzaDailyHistory(avanzaDailyJson?.ohlc ?? []);

    let history =
      avanzaDaily.length >= 252
        ? avanzaDaily
        : avanzaDaily.length >= 2
          ? avanzaDaily
          : (fredHistory ?? []);

    if (history.length < 2 && fredHistory) {
      history = fredHistory;
    }

    if (history.length < 2) {
      return unavailableQuote(countryId, "Daily history unavailable");
    }

    const avanzaPrice = avanzaIndex?.quote?.last ?? null;
    const yahooPrice = yahoo?.price ?? null;
    const price = avanzaPrice ?? yahooPrice ?? history[history.length - 1]!.price;

    const changePercent = resolveChangePercent(avanzaIndex, price, history);
    if (changePercent == null || !Number.isFinite(changePercent)) {
      return unavailableQuote(countryId, "No usable 1D %");
    }

    const intraday =
      avanzaIntraday.length >= 2
        ? avanzaIntraday
        : yahoo?.intraday && yahoo.intraday.length >= 2
          ? yahoo.intraday
          : [];

    const dayLow =
      avanzaIndex?.quote?.lowest ??
      yahoo?.dayLow ??
      null;
    const dayHigh =
      avanzaIndex?.quote?.highest ??
      yahoo?.dayHigh ??
      null;

    const exchangeTimezoneName =
      yahoo?.exchangeTimezoneName ?? NQGI_EXCHANGE_TZ.exchangeTimezoneName;
    const gmtoffset = yahoo?.gmtoffset ?? NQGI_EXCHANGE_TZ.gmtoffset;
    const timezone = yahoo?.timezone ?? NQGI_EXCHANGE_TZ.timezone;

    const dayRange = resolveDayHighLow({
      dayLow,
      dayHigh,
      intraday,
      exchangeTz: exchangeTzFromRow({
        ticker: NQGI_YAHOO_TICKER,
        exchangeTimezoneName,
        gmtoffset,
        timezone,
      }),
    });

    const useLiveQuote = avanzaPrice != null || yahooPrice != null;
    const status = deriveEquityMarketStatus({
      price,
      changePercent,
      regularMarketTime: useLiveQuote ? (yahoo?.regularMarketTime ?? null) : null,
      marketState: yahoo?.marketState ?? null,
      exchangeTimezoneName,
      gmtoffset,
      countryId: NQGI_COUNTRY_ID,
      region: "Global",
      ticker: NQGI_YAHOO_TICKER,
    });

    const dailyCloses = history.map((p) => p.price);
    const chartSeries = intraday.length >= 2 ? intraday.map((p) => p.price) : dailyCloses;

    const usedAvanzaPrimary = avanzaPrice != null && avanzaDaily.length >= 2;
    const source =
      usedAvanzaPrimary
        ? NQGI_SOURCE
        : avanzaPrice != null || (yahooPrice != null && fredHistory)
          ? NQGI_SOURCE_FALLBACK
          : fredHistory && !avanzaPrice && !yahooPrice
            ? "FRED"
            : NQGI_SOURCE_FALLBACK;

    return {
      countryId,
      price,
      changePercent,
      dayLow: dayRange.dayLow,
      dayHigh: dayRange.dayHigh,
      history,
      intraday,
      chartSeries,
      exchangeTimezoneName,
      gmtoffset,
      timezone,
      status,
      source,
    };
  } catch (e) {
    return unavailableQuote(countryId, e instanceof Error ? e.message : "NQGI fetch failed");
  }
}
