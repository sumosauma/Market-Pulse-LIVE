/**
 * OMXN40-only Avanza enrichment via public JSON (no login, no HTML scrape).
 *
 * Supplements the Nasdaq OMXN40 helper with intraday bars for the 1D chart when available.
 * Unofficial Avanza frontend API — easy to remove; not used for any other market.
 */

import type { EquityHistoryPoint, EquityMarketQuote } from "../types";
import { countValidDailyCloses } from "./eu500AvanzaFallback";
import { exchangeTzFromRow } from "../equityExchangeTz";
import { resolveDayHighLow } from "../equityIntradaySession";

export const OMXN40_AVANZA_ORDERBOOK_ID = "53548";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-OMXN40-Avanza/1.0)";

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
}>;

type AvanzaMarketIndexJson = Readonly<{
  quote?: Readonly<{
    last?: number;
    highest?: number;
    lowest?: number;
    changePercent?: number;
  }>;
  previousClosingPrice?: number;
}>;

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

/** Today's session bars — five-minute resolution keeps payload small. */
export async function fetchOmxn40AvanzaIntraday(): Promise<EquityHistoryPoint[] | null> {
  const url = `https://www.avanza.se/_api/price-chart/stock/${OMXN40_AVANZA_ORDERBOOK_ID}?timePeriod=today&resolution=five_minutes`;
  const json = await avanzaFetch<AvanzaPriceChartJson>(url);
  const points = downsampleIntraday(parseAvanzaIntraday(json?.ohlc ?? []));
  return points.length >= 2 ? points : null;
}

export async function fetchOmxn40AvanzaDailyHistory(): Promise<EquityHistoryPoint[] | null> {
  const url = `https://www.avanza.se/_api/price-chart/stock/${OMXN40_AVANZA_ORDERBOOK_ID}?timePeriod=three_years&resolution=day`;
  const json = await avanzaFetch<AvanzaPriceChartJson>(url);
  const history = parseAvanzaDailyHistory(json?.ohlc ?? []);
  return history.length >= 2 ? history : null;
}

/** Optional market-index snapshot — not called in the default merge path. */
export async function fetchOmxn40AvanzaIndexSnapshot(): Promise<{
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  dayLow: number | null;
  dayHigh: number | null;
} | null> {
  const json = await avanzaFetch<AvanzaMarketIndexJson>(
    `https://www.avanza.se/_api/market-index/${OMXN40_AVANZA_ORDERBOOK_ID}`,
  );
  if (!json) return null;
  return {
    price: json.quote?.last ?? null,
    previousClose: json.previousClosingPrice ?? null,
    changePercent: json.quote?.changePercent ?? null,
    dayLow: json.quote?.lowest ?? null,
    dayHigh: json.quote?.highest ?? null,
  };
}

/**
 * Enrich a Nasdaq OMXN40 quote with Avanza intraday (and daily only if Nasdaq history is sparse).
 * Returns the input quote unchanged when Avanza fails or adds nothing useful.
 */
export async function applyOmxn40AvanzaFallback(
  nasdaqQuote: EquityMarketQuote,
): Promise<EquityMarketQuote> {
  if (nasdaqQuote.countryId !== "omxn40") return nasdaqQuote;

  try {
    const needsDaily =
      countValidDailyCloses(nasdaqQuote.history ?? []) < 2;

    const [intraday, avanzaDaily, avanzaSnapshot] = await Promise.all([
      fetchOmxn40AvanzaIntraday(),
      needsDaily ? fetchOmxn40AvanzaDailyHistory() : Promise.resolve(null),
      nasdaqQuote.dayLow == null || nasdaqQuote.dayHigh == null
        ? fetchOmxn40AvanzaIndexSnapshot()
        : Promise.resolve(null),
    ]);

    let next: EquityMarketQuote = nasdaqQuote;

    if (needsDaily && avanzaDaily && avanzaDaily.length >= 2) {
      next = { ...next, history: avanzaDaily, chartSeries: avanzaDaily.map((p) => p.price) };
    }

    if (intraday && intraday.length >= 2) {
      const closes = intraday.map((p) => p.price);
      next = {
        ...next,
        intraday,
        chartSeries: closes,
      };
    }

    const dayRange = resolveDayHighLow({
      dayLow: next.dayLow ?? avanzaSnapshot?.dayLow ?? null,
      dayHigh: next.dayHigh ?? avanzaSnapshot?.dayHigh ?? null,
      intraday: next.intraday ?? [],
      exchangeTz: exchangeTzFromRow(next),
    });

    return {
      ...next,
      dayLow: dayRange.dayLow,
      dayHigh: dayRange.dayHigh,
    };
  } catch {
    return nasdaqQuote;
  }
}
