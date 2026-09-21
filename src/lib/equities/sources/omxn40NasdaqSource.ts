/**
 * OMXN40-only quote + daily history via Nasdaq public JSON API.
 *
 * Used instead of Yahoo for ^OMXN40 — Yahoo returns a live price but only one daily bar.
 * Unofficial Nasdaq frontend API — easy to remove; not used for any other market.
 */

import { change1dPercentFromDailyHistory } from "../equityDayChange";
import { applyOmxn40AvanzaFallback } from "./omxn40AvanzaFallback";
import { deriveEquityMarketStatus } from "../equityMarketStatus";
import type { EquityHistoryPoint, EquityMarketQuote } from "../types";

export const OMXN40_YAHOO_TICKER = "^OMXN40";
export const OMXN40_COUNTRY_ID = "omxn40";
export const OMXN40_NASDAQ_SYMBOL = "OMXN40";
export const OMXN40_SOURCE = "Nasdaq";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-OMXN40/1.0)";
const CHART_LIMIT = 400;

type NasdaqSummaryField = Readonly<{ value?: string }>;

type NasdaqInfoJson = Readonly<{
  data?: Readonly<{
    primaryData?: Readonly<{
      lastSalePrice?: string;
      percentageChange?: string;
      lastTradeTimestamp?: string;
    }>;
    summaryData?: Readonly<{
      PreviousClose?: NasdaqSummaryField;
      TodaysHigh?: NasdaqSummaryField;
      TodaysLow?: NasdaqSummaryField;
      NetChangePercentageChange?: NasdaqSummaryField;
    }>;
  }>;
}>;

type NasdaqChartPoint = Readonly<{
  x?: number;
  y?: number;
  z?: Readonly<{ dateTime?: string; lastSalePrice?: string }>;
}>;

type NasdaqChartJson = Readonly<{
  data?: Readonly<{
    chart?: readonly NasdaqChartPoint[];
  }>;
}>;

function parseNasdaqNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseNasdaqPercent(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const match = raw.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const n = Number.parseFloat(match[1]!);
  return Number.isFinite(n) ? n : null;
}

function parseNetChangePercentField(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const slash = raw.split("/");
  return parseNasdaqPercent(slash[slash.length - 1] ?? raw);
}

function nasdaqChartDateRange(): Readonly<{ fromdate: string; todate: string }> {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 2);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { fromdate: fmt(from), todate: fmt(to) };
}

async function nasdaqFetch<T>(url: string): Promise<T | null> {
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

function parseNasdaqChartHistory(chart: readonly NasdaqChartPoint[] | undefined): EquityHistoryPoint[] {
  if (!chart?.length) return [];

  const byDate = new Map<string, number>();
  for (const point of chart) {
    const price =
      typeof point.y === "number" && Number.isFinite(point.y)
        ? point.y
        : parseNasdaqNumber(point.z?.lastSalePrice);
    if (price == null) continue;

    let date: string | null = null;
    if (typeof point.x === "number" && Number.isFinite(point.x)) {
      date = new Date(point.x).toISOString().slice(0, 10);
    } else if (point.z?.dateTime) {
      const parsed = Date.parse(point.z.dateTime);
      if (Number.isFinite(parsed)) date = new Date(parsed).toISOString().slice(0, 10);
    }
    if (!date) continue;
    byDate.set(date, price);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));
}

function unavailableQuote(countryId: string, error?: string): EquityMarketQuote {
  return {
    countryId,
    price: null,
    changePercent: null,
    status: "unavailable",
    source: OMXN40_SOURCE,
    error,
  };
}

/** Fetch OMX Nordic 40 from Nasdaq — never throws. */
export async function fetchOmxn40NasdaqQuote(countryId: string): Promise<EquityMarketQuote> {
  if (countryId !== OMXN40_COUNTRY_ID) {
    return unavailableQuote(countryId, "Not OMXN40");
  }

  try {
    const { fromdate, todate } = nasdaqChartDateRange();
    const chartUrl =
      `https://api.nasdaq.com/api/quote/${OMXN40_NASDAQ_SYMBOL}/chart` +
      `?assetclass=index&fromdate=${fromdate}&todate=${todate}&limit=${CHART_LIMIT}`;
    const infoUrl = `https://api.nasdaq.com/api/quote/${OMXN40_NASDAQ_SYMBOL}/info?assetclass=index`;

    const [infoJson, chartJson] = await Promise.all([
      nasdaqFetch<NasdaqInfoJson>(infoUrl),
      nasdaqFetch<NasdaqChartJson>(chartUrl),
    ]);

    if (!infoJson && !chartJson) {
      return unavailableQuote(countryId, "Nasdaq fetch failed");
    }

    const primary = infoJson?.data?.primaryData;
    const summary = infoJson?.data?.summaryData;

    const price = parseNasdaqNumber(primary?.lastSalePrice) ?? null;

    if (price == null) {
      return unavailableQuote(countryId, "No Nasdaq price");
    }

    const history = parseNasdaqChartHistory(chartJson?.data?.chart);
    if (history.length < 2) {
      return unavailableQuote(countryId, "Insufficient Nasdaq daily history");
    }

    const previousClose = parseNasdaqNumber(summary?.PreviousClose?.value);
    const changePercent =
      parseNasdaqPercent(primary?.percentageChange) ??
      parseNetChangePercentField(summary?.NetChangePercentageChange?.value) ??
      (previousClose != null && previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : change1dPercentFromDailyHistory(history, price));

    if (changePercent == null || !Number.isFinite(changePercent)) {
      return unavailableQuote(countryId, "No usable 1D %");
    }

    const dayLow = parseNasdaqNumber(summary?.TodaysLow?.value);
    const dayHigh = parseNasdaqNumber(summary?.TodaysHigh?.value);
    const dailyCloses = history.map((p) => p.price);

    const status = deriveEquityMarketStatus({
      price,
      changePercent,
      exchangeTimezoneName: "Europe/Stockholm",
      gmtoffset: 3600,
      countryId: "omxn40",
      region: "Europe",
    });

    const nasdaqQuote: EquityMarketQuote = {
      countryId,
      price,
      changePercent,
      dayLow,
      dayHigh,
      history,
      intraday: [],
      chartSeries: dailyCloses,
      exchangeTimezoneName: "Europe/Stockholm",
      gmtoffset: 3600,
      timezone: "CET",
      status,
      source: OMXN40_SOURCE,
    };

    return applyOmxn40AvanzaFallback(nasdaqQuote);
  } catch (e) {
    return unavailableQuote(countryId, e instanceof Error ? e.message : "Nasdaq fetch failed");
  }
}

export function isOmxn40Market(market: { countryId: string; ticker: string }): boolean {
  return market.countryId === OMXN40_COUNTRY_ID || market.ticker === OMXN40_YAHOO_TICKER;
}
