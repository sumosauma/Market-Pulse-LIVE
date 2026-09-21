import { createServerFn } from "@tanstack/react-start";
import { EQUITY_MARKETS } from "./equityMarketsRegistry";
import type { EquityHistoryPoint, EquityMarketQuote, EquityMarketsPayload, EquityMarketStatus } from "./types";
import { change1dPercentFromDailyHistory } from "./equityDayChange";
import { exchangeLocalDateKey, exchangeTzFromRow, type ExchangeTz } from "./equityExchangeTz";
import { readDayExtreme, resolveDayHighLow } from "./equityIntradaySession";
import { deriveEquityMarketStatus } from "./equityMarketStatus";
import {
  applyDenmarkAvanzaIntradayFallback,
  DK_YAHOO_TICKER,
} from "./sources/denmarkIntradaySource";
import {
  applyEu500AvanzaFallback,
  countValidDailyCloses,
  EU500_YAHOO_TICKER,
} from "./sources/eu500AvanzaFallback";
import { fetchOmxn40NasdaqQuote, isOmxn40Market } from "./sources/omxn40NasdaqSource";
import { fetchNqgiAvanzaQuote, isNqgiMarket } from "./sources/nqgiAvanzaSource";
import { fetchNqzaFredYahooQuote, isNqzaMarket } from "./sources/nqzaFredSource";

const FETCH_TIMEOUT_MS = 8_000;
/** Yahoo's daily chart for CSI 300 currently returns a single bar. 30m still has sessions. */
const CN_CSI300_YAHOO_TICKER = "000300.SS";

type YahooChartJson = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: unknown;
        regularMarketDayLow?: unknown;
        regularMarketDayHigh?: unknown;
        chartPreviousClose?: unknown;
        previousClose?: unknown;
        exchangeTimezoneName?: unknown;
        gmtoffset?: unknown;
        timezone?: unknown;
        regularMarketTime?: unknown;
        marketState?: unknown;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string };
  };
};

type YahooIndexResult = Readonly<{
  price: number;
  changePercent: number | null;
  status: EquityMarketStatus;
  dayLow: number | null;
  dayHigh: number | null;
  history: EquityHistoryPoint[];
  intraday: EquityHistoryPoint[];
  /** Intraday closes for detail chart; falls back to daily history in UI. */
  chartSeries: number[];
  exchangeTimezoneName: string | null;
  gmtoffset: number | null;
  timezone: string | null;
  regularMarketTime: number | null;
  marketState: string | null;
}>;

type YahooChartResult = NonNullable<NonNullable<YahooChartJson["chart"]>["result"]>[number];

function parseYahooDailyPoints(result: YahooChartResult): EquityHistoryPoint[] {
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: EquityHistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") {
      points.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), price: c });
    }
  }
  return points;
}

function parseYahooIntradayPoints(result: YahooChartResult): EquityHistoryPoint[] {
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: EquityHistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") {
      points.push({ date: new Date(ts[i] * 1000).toISOString(), price: c });
    }
  }
  return points;
}

/** Last 30m close of each exchange-local session, oldest first. */
function dailyHistoryFromIntradaySessions(
  intraday: readonly EquityHistoryPoint[],
  tz: ExchangeTz,
): EquityHistoryPoint[] {
  const byDate = new Map<string, number>();
  for (const point of intraday) {
    if (!Number.isFinite(point.price)) continue;
    byDate.set(exchangeLocalDateKey(point.date, tz), point.price);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));
}

function downsamplePoints(points: EquityHistoryPoint[], maxPoints = 90): EquityHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const out: EquityHistoryPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

async function fetchYahooChart(ticker: string, interval: "1d" | "30m", range: string): Promise<YahooChartResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = (await res.json()) as YahooChartJson;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? "No chart data");
  return result;
}

function readMetaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readExchangeTz(meta: YahooChartResult["meta"]): {
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

async function fetchYahooIndex(
  ticker: string,
  statusContext?: Readonly<{ countryId: string; region?: string; ticker?: string }>,
): Promise<YahooIndexResult> {
  const [dailyResult, intradayResult] = await Promise.allSettled([
    fetchYahooChart(ticker, "1d", "1y"),
    fetchYahooChart(ticker, "30m", "5d"),
  ]);

  if (dailyResult.status === "rejected") {
    throw dailyResult.reason instanceof Error ? dailyResult.reason : new Error("Daily fetch failed");
  }

  const dailyChart = dailyResult.value;
  const meta = dailyChart.meta ?? {};
  const price = meta.regularMarketPrice;
  if (typeof price !== "number") throw new Error("No price");

  let points = parseYahooDailyPoints(dailyChart);
  const allValidCloses = points.map((p) => p.price);

  let chartSeries = allValidCloses;
  let intraday: EquityHistoryPoint[] = [];
  let rawIntraday: EquityHistoryPoint[] = [];
  let exchangeTz = readExchangeTz(meta);
  if (intradayResult.status === "fulfilled") {
    const intradayMeta = readExchangeTz(intradayResult.value.meta);
    if (intradayMeta.exchangeTimezoneName || intradayMeta.gmtoffset != null) {
      exchangeTz = intradayMeta;
    }
    rawIntraday = parseYahooIntradayPoints(intradayResult.value);
    intraday = downsamplePoints(rawIntraday);
    const closes = intraday.map((p) => p.price);
    if (closes.length >= 2) chartSeries = closes;
  }

  // China-only: Yahoo daily `000300.SS` is a one-bar print. Rebuild daily closes
  // from Yahoo 30-minute bars so 1D % is not dropped. The 5d intraday chart is unchanged.
  if (ticker === CN_CSI300_YAHOO_TICKER && points.length < 2) {
    let sessionBars = rawIntraday;
    try {
      const longer = await fetchYahooChart(ticker, "30m", "60d");
      const longerBars = parseYahooIntradayPoints(longer);
      if (longerBars.length > sessionBars.length) {
        const longerTz = readExchangeTz(longer.meta);
        if (longerTz.exchangeTimezoneName || longerTz.gmtoffset != null) exchangeTz = longerTz;
        sessionBars = longerBars;
      }
    } catch {
      /* 5d session closes are enough for 1D */
    }
    const rebuilt = dailyHistoryFromIntradaySessions(
      sessionBars,
      exchangeTzFromRow({
        ticker,
        exchangeTimezoneName: exchangeTz.exchangeTimezoneName ?? "Asia/Shanghai",
        gmtoffset: exchangeTz.gmtoffset,
        timezone: exchangeTz.timezone,
      }),
    );
    if (rebuilt.length >= 2) points = rebuilt;
  }

  const changePercent = change1dPercentFromDailyHistory(points, price);
  const regularMarketTime = readMetaNumber(meta.regularMarketTime);
  const marketState = typeof meta.marketState === "string" ? meta.marketState : null;
  const status = deriveEquityMarketStatus({
    price,
    changePercent,
    regularMarketTime,
    marketState,
    exchangeTimezoneName: exchangeTz.exchangeTimezoneName,
    gmtoffset: exchangeTz.gmtoffset,
    countryId: statusContext?.countryId ?? null,
    region: statusContext?.region ?? null,
    ticker: statusContext?.ticker ?? ticker,
  });

  const dayRange = resolveDayHighLow({
    dayLow: readDayExtreme(meta.regularMarketDayLow),
    dayHigh: readDayExtreme(meta.regularMarketDayHigh),
    intraday,
    exchangeTz: exchangeTzFromRow({
      ticker: statusContext?.ticker ?? ticker,
      exchangeTimezoneName: exchangeTz.exchangeTimezoneName,
      gmtoffset: exchangeTz.gmtoffset,
      timezone: exchangeTz.timezone,
    }),
  });

  let indexResult: YahooIndexResult = {
    price,
    changePercent,
    status,
    dayLow: dayRange.dayLow,
    dayHigh: dayRange.dayHigh,
    history: points,
    intraday,
    chartSeries,
    exchangeTimezoneName: exchangeTz.exchangeTimezoneName,
    gmtoffset: exchangeTz.gmtoffset,
    timezone: exchangeTz.timezone,
    regularMarketTime,
    marketState,
  };

  // EU500-only: Avanza daily history when Yahoo returns fewer than 2 daily closes.
  if (ticker === EU500_YAHOO_TICKER && countValidDailyCloses(points) < 2) {
    indexResult = await applyEu500AvanzaFallback(indexResult);
  }

  // Denmark-only: Avanza intraday when Yahoo ^OMXC25 is sparse.
  if (ticker === DK_YAHOO_TICKER) {
    indexResult = await applyDenmarkAvanzaIntradayFallback(indexResult, ticker);
  }

  return indexResult;
}

async function fetchMarketQuote(market: (typeof EQUITY_MARKETS)[number]): Promise<EquityMarketQuote> {
  if (!market.isLive) {
    return {
      countryId: market.countryId,
      price: null,
      changePercent: null,
      status: "unavailable",
      source: market.source,
      error: "Not configured for live data",
    };
  }

  try {
    if (isOmxn40Market(market)) {
      return fetchOmxn40NasdaqQuote(market.countryId);
    }

    if (isNqzaMarket(market)) {
      return fetchNqzaFredYahooQuote(market.countryId);
    }

    if (isNqgiMarket(market)) {
      return fetchNqgiAvanzaQuote(market.countryId);
    }

    const data = await fetchYahooIndex(market.ticker, {
      countryId: market.countryId,
      region: market.region,
      ticker: market.ticker,
    });
    return {
      countryId: market.countryId,
      price: data.price,
      changePercent: data.changePercent,
      dayLow: data.dayLow,
      dayHigh: data.dayHigh,
      history: data.history,
      intraday: data.intraday,
      chartSeries: data.chartSeries,
      exchangeTimezoneName: data.exchangeTimezoneName,
      gmtoffset: data.gmtoffset,
      timezone: data.timezone,
      status: data.status,
      source: market.source,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return {
      countryId: market.countryId,
      price: null,
      changePercent: null,
      status: "unavailable",
      source: market.source,
      error: msg,
    };
  }
}

export const getEquityMarkets = createServerFn({ method: "GET" }).handler(async (): Promise<EquityMarketsPayload> => {
  const fetchedAt = new Date().toISOString();
  try {
    const quotes = await Promise.all(EQUITY_MARKETS.map((m) => fetchMarketQuote(m)));
    return { quotes, fetchedAt };
  } catch (error) {
    const quotes = EQUITY_MARKETS.map((m) => ({
      countryId: m.countryId,
      price: null as number | null,
      changePercent: null as number | null,
      status: "unavailable" as const,
      source: m.source,
      error: error instanceof Error ? error.message : "Server fetch failed",
    }));
    return { quotes, fetchedAt };
  }
});
