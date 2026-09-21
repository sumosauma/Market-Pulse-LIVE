/**
 * EU500-only daily history fallback via Avanza public JSON (no login, no HTML scrape).
 *
 * Used when Yahoo `EU500.AS` returns a live price but fewer than 2 daily closes.
 * Unofficial Avanza frontend API — easy to remove; not used for any other market.
 */

import { change1dPercentFromDailyHistory } from "../equityDayChange";
import { deriveEquityMarketStatus } from "../equityMarketStatus";
import type { EquityHistoryPoint, EquityMarketStatus } from "../types";

/** Yahoo ticker for Euronext Europe 500 in the equity registry. */
export const EU500_YAHOO_TICKER = "EU500.AS";

/** Avanza orderbook for EN Europe 500 (ISIN NL0013273014). */
export const EU500_AVANZA_ORDERBOOK_ID = "155712";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-EU500-Fallback/1.0)";

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
}>;

export type Eu500YahooSnapshot = Readonly<{
  price: number;
  changePercent: number | null;
  status: EquityMarketStatus;
  dayLow: number | null;
  dayHigh: number | null;
  history: EquityHistoryPoint[];
  intraday: EquityHistoryPoint[];
  chartSeries: number[];
  exchangeTimezoneName: string | null;
  gmtoffset: number | null;
  timezone: string | null;
  regularMarketTime: number | null;
  marketState: string | null;
}>;

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

/** Single Avanza request — daily OHLC only (no search, no extra index call). */
export async function fetchEu500AvanzaDailyHistory(): Promise<EquityHistoryPoint[] | null> {
  try {
    const url = `https://www.avanza.se/_api/price-chart/stock/${EU500_AVANZA_ORDERBOOK_ID}?timePeriod=three_years&resolution=day`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as AvanzaPriceChartJson;
    const history = parseAvanzaDailyHistory(json.ohlc ?? []);
    return history.length >= 2 ? history : null;
  } catch {
    return null;
  }
}

export function countValidDailyCloses(history: readonly EquityHistoryPoint[]): number {
  return history.filter((p) => typeof p.price === "number" && Number.isFinite(p.price)).length;
}

/**
 * Merge Yahoo EU500 quote with Avanza daily history when Yahoo history is sparse.
 * Returns the original snapshot unchanged if Avanza fails or history stays insufficient.
 */
export async function applyEu500AvanzaFallback(
  yahoo: Eu500YahooSnapshot,
): Promise<Eu500YahooSnapshot> {
  const avanzaHistory = await fetchEu500AvanzaDailyHistory();
  if (!avanzaHistory || avanzaHistory.length < 2) return yahoo;

  const changePercent = change1dPercentFromDailyHistory(avanzaHistory, yahoo.price);
  const status = deriveEquityMarketStatus({
    price: yahoo.price,
    changePercent,
    regularMarketTime: yahoo.regularMarketTime,
    marketState: yahoo.marketState,
    exchangeTimezoneName: yahoo.exchangeTimezoneName,
    gmtoffset: yahoo.gmtoffset,
    countryId: "eu500",
    region: "Europe",
  });

  const dailyCloses = avanzaHistory.map((p) => p.price);

  return {
    ...yahoo,
    changePercent,
    status,
    history: avanzaHistory,
    chartSeries: dailyCloses.length >= 2 ? dailyCloses : yahoo.chartSeries,
  };
}
