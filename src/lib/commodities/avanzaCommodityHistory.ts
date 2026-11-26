/**
 * Commodity quotes + daily history via Avanza public JSON (same pattern as eu500AvanzaFallback).
 * Unofficial frontend API — authorized for this desk. Fallback policy lives in the caller.
 */

import { percentChange, trimChart, type CommodityPoint } from "./overview";
import type { HistoryPoint } from "./indicators";
import { INTRADAY_MIN_POINTS } from "./intraday";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-Commodity-Avanza/1.0)";
/** Calendar days to walk back for a completed 5-minute session (weekends + holidays). */
const INTRADAY_PRIOR_LOOKBACK_DAYS = 7;

/** Orderbooks from avanza.se/index/om-indexet.html/{id}/… */
export const AVANZA_COMMODITY_ORDERBOOKS = {
  brent: "155722",
  wti: "155497",
  "henry-hub": "1650059",
  gold: "18986",
  silver: "18991",
} as const;

export type AvanzaCommodityId = keyof typeof AVANZA_COMMODITY_ORDERBOOKS;

export const AVANZA_COMMODITY_UNITS: Record<AvanzaCommodityId, string> = {
  brent: "USD/bbl",
  wti: "USD/bbl",
  "henry-hub": "USD/MMBtu",
  gold: "USD/oz",
  silver: "USD/oz",
};

export const AVANZA_COMMODITY_LABELS: Record<
  AvanzaCommodityId,
  { ticker: string; contractLabel: string }
> = {
  brent: {
    ticker: "Avanza Brent Spot",
    contractLabel:
      "Avanza Brent oil index (USD/bbl): average of spot and the two nearest futures — not dated Brent spot and not NYMEX/ICE futures. Last, 1D%, Price History and 20D RV use this same series.",
  },
  wti: {
    ticker: "Avanza WTI Spot",
    contractLabel:
      "Avanza WTI Spot index (USD/bbl). Retail commodity index — not a Cushing physical spot assessment and not identical to NYMEX CL. Last, 1D%, Price History and 20D RV use this same series.",
  },
  "henry-hub": {
    ticker: "Avanza Naturgas",
    contractLabel:
      "Avanza Naturgas index (USD/MMBtu scale). Not verified EIA Henry Hub spot and not NYMEX NG futures. Last, 1D%, Price History and 20D RV use this same series.",
  },
  gold: {
    ticker: "Avanza Guld OTC-Spot",
    contractLabel:
      "Avanza gold OTC-spot (USD/oz). Not COMEX futures. Last, 1D%, Price History and 20D RV use this same series.",
  },
  silver: {
    ticker: "Avanza Silver OTC-Spot",
    contractLabel:
      "Avanza silver OTC-spot (USD/oz). Not COMEX futures. Last, 1D%, Price History and 20D RV use this same series.",
  },
};

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
  previousClosingPrice?: number;
}>;

type AvanzaMarketIndexJson = Readonly<{
  name?: string;
  description?: string;
  previousClosingPrice?: number;
  quote?: Readonly<{
    last?: number;
    change?: number;
    changePercent?: number;
    timeOfLast?: number;
    updated?: number;
    highest?: number;
    lowest?: number;
  }>;
}>;

export type AvanzaCommodityQuote = Readonly<{
  last: number;
  previousClose: number | null;
  changePercent1d: number | null;
  change: number | null;
  asOf: string | null;
  name: string | null;
  description: string | null;
}>;

function parseAvanzaDailyHistory(ohlc: readonly AvanzaOhlcBar[], now = new Date()): HistoryPoint[] {
  /** Exclude the current UTC calendar day — may be an incomplete daily candle. */
  const todayUtc = now.toISOString().slice(0, 10);
  const byDate = new Map<string, number>();
  for (const bar of ohlc) {
    if (typeof bar.timestamp !== "number" || typeof bar.close !== "number") continue;
    if (!Number.isFinite(bar.close) || !(bar.close > 0)) continue;
    const date = new Date(bar.timestamp).toISOString().slice(0, 10);
    if (date >= todayUtc) continue;
    byDate.set(date, bar.close);
  }
  return [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isAvanzaCommodityId(id: string): id is AvanzaCommodityId {
  return Object.prototype.hasOwnProperty.call(AVANZA_COMMODITY_ORDERBOOKS, id);
}

async function avanzaGetJson<T>(url: string): Promise<T | null> {
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

/** Live index quote: Last, previous close, 1D%, timestamp. */
export async function fetchAvanzaCommodityQuote(
  commodityId: AvanzaCommodityId,
): Promise<AvanzaCommodityQuote | null> {
  const orderBookId = AVANZA_COMMODITY_ORDERBOOKS[commodityId];
  const json = await avanzaGetJson<AvanzaMarketIndexJson>(
    `https://www.avanza.se/_api/market-index/${orderBookId}`,
  );
  const last = json?.quote?.last;
  if (typeof last !== "number" || !Number.isFinite(last) || !(last > 0)) return null;

  const previousClose =
    typeof json?.previousClosingPrice === "number" && json.previousClosingPrice > 0
      ? json.previousClosingPrice
      : null;
  const reportedPct =
    typeof json?.quote?.changePercent === "number" && Number.isFinite(json.quote.changePercent)
      ? json.quote.changePercent
      : null;
  const calculatedPct = previousClose != null ? percentChange(last, previousClose) : null;
  // Prefer Avanza's published 1D%; fall back to same-instrument (Last − prevClose) / prevClose.
  const changePercent1d = reportedPct ?? calculatedPct;

  const ts =
    typeof json?.quote?.timeOfLast === "number"
      ? json.quote.timeOfLast
      : typeof json?.quote?.updated === "number"
        ? json.quote.updated
        : null;

  return {
    last,
    previousClose,
    changePercent1d,
    change: typeof json?.quote?.change === "number" ? json.quote.change : null,
    asOf: ts != null ? new Date(ts).toISOString() : null,
    name: typeof json?.name === "string" ? json.name : null,
    description: typeof json?.description === "string" ? json.description : null,
  };
}

/** Three-year daily OHLC — mirrors equities Avanza fallback. */
export async function fetchAvanzaCommodityDailyHistory(
  commodityId: AvanzaCommodityId,
): Promise<HistoryPoint[] | null> {
  const orderBookId = AVANZA_COMMODITY_ORDERBOOKS[commodityId];
  const json = await avanzaGetJson<AvanzaPriceChartJson>(
    `https://www.avanza.se/_api/price-chart/stock/${orderBookId}?timePeriod=three_years&resolution=day`,
  );
  if (!json) return null;
  const history = parseAvanzaDailyHistory(json.ohlc ?? []);
  return history.length >= 21 ? history : history.length >= 2 ? history : null;
}

/** Daily closes as overview chart points (trimmed). */
export async function fetchAvanzaCommodityChart(
  commodityId: AvanzaCommodityId,
): Promise<CommodityPoint[]> {
  const history = await fetchAvanzaCommodityDailyHistory(commodityId);
  if (!history?.length) return [];
  return trimChart(history.map((bar) => ({ date: bar.date, price: bar.close })));
}

export type AvanzaIntradayBar = Readonly<{
  timestamp: number;
  close: number;
}>;

export type AvanzaIntradayPayload = Readonly<{
  bars: AvanzaIntradayBar[];
  /** Provider session calendar date when present (`YYYY-MM-DD`). */
  sessionDate: string | null;
  previousClosingPrice: number | null;
}>;

type AvanzaIntradayChartJson = AvanzaPriceChartJson & { from?: string; to?: string };

function stockholmCalendarDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(now);
}

/** Shift a `YYYY-MM-DD` calendar day by `delta` days (UTC date arithmetic). */
export function shiftIsoCalendarDay(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function parseAvanzaIntradayChart(
  json: AvanzaIntradayChartJson | null,
  fallbackSessionDate?: string | null,
): AvanzaIntradayPayload | null {
  if (!json) return null;
  const bars: AvanzaIntradayBar[] = [];
  for (const bar of json.ohlc ?? []) {
    if (typeof bar.timestamp !== "number" || typeof bar.close !== "number") continue;
    if (!Number.isFinite(bar.close) || !(bar.close > 0)) continue;
    bars.push({ timestamp: bar.timestamp, close: bar.close });
  }
  bars.sort((a, b) => a.timestamp - b.timestamp);
  const sessionDate =
    typeof json.to === "string" && /^\d{4}-\d{2}-\d{2}/.test(json.to)
      ? json.to.slice(0, 10)
      : typeof json.from === "string" && /^\d{4}-\d{2}-\d{2}/.test(json.from)
        ? json.from.slice(0, 10)
        : fallbackSessionDate ??
          (bars.length ? new Date(bars[bars.length - 1]!.timestamp).toISOString().slice(0, 10) : null);
  return {
    bars,
    sessionDate,
    previousClosingPrice:
      typeof json.previousClosingPrice === "number" && json.previousClosingPrice > 0
        ? json.previousClosingPrice
        : null,
  };
}

async function fetchAvanzaIntradayToday(orderBookId: string): Promise<AvanzaIntradayPayload | null> {
  const json = await avanzaGetJson<AvanzaIntradayChartJson>(
    `https://www.avanza.se/_api/price-chart/stock/${orderBookId}?timePeriod=today&resolution=five_minutes`,
  );
  return parseAvanzaIntradayChart(json);
}

/** Verified historical date-range endpoint (same calendar day in `from` / `to`). */
async function fetchAvanzaIntradaySessionDay(
  orderBookId: string,
  day: string,
): Promise<AvanzaIntradayPayload | null> {
  const json = await avanzaGetJson<AvanzaIntradayChartJson>(
    `https://www.avanza.se/_api/price-chart/stock/${orderBookId}?resolution=five_minutes&from=${day}&to=${day}`,
  );
  return parseAvanzaIntradayChart(json, day);
}

/**
 * 5-minute OHLC for the same orderbook as Last / daily history.
 * Prefers Stockholm "today" when it has enough bars; otherwise walks back a bounded
 * number of calendar days via the date-range endpoint (weekends / holidays / post-midnight).
 * Does not invent bars — null / sparse when the feed has no eligible session.
 */
export async function fetchAvanzaCommodityIntraday(
  commodityId: AvanzaCommodityId,
): Promise<AvanzaIntradayPayload | null> {
  const orderBookId = AVANZA_COMMODITY_ORDERBOOKS[commodityId];
  const today = await fetchAvanzaIntradayToday(orderBookId);
  if (today && today.bars.length >= INTRADAY_MIN_POINTS) return today;

  const stockholmToday = stockholmCalendarDay();
  for (let back = 1; back <= INTRADAY_PRIOR_LOOKBACK_DAYS; back++) {
    const day = shiftIsoCalendarDay(stockholmToday, -back);
    const prior = await fetchAvanzaIntradaySessionDay(orderBookId, day);
    if (prior && prior.bars.length >= INTRADAY_MIN_POINTS) return prior;
  }

  // Insufficient today and no eligible prior session — return sparse today (if any) for callers.
  return today;
}
