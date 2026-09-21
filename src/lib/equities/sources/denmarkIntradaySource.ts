/**
 * Denmark (^OMXC25) intraday via Avanza public JSON — Yahoo 30m is sparse (afternoon-only).
 *
 * Unofficial Avanza frontend API — easy to remove; not used for any other market.
 */

import { exchangeTzFromRow } from "../equityExchangeTz";
import { resolveDayHighLow } from "../equityIntradaySession";
import type { EquityHistoryPoint } from "../types";

export const DK_YAHOO_TICKER = "^OMXC25";
export const DK_COUNTRY_ID = "DK";
export const DK_OMXC25_AVANZA_ORDERBOOK_ID = "731293";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-DK-Avanza/1.0)";

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
}>;

type AvanzaMarketIndexJson = Readonly<{
  quote?: Readonly<{
    highest?: number;
    lowest?: number;
  }>;
}>;

type YahooIntradaySnapshot = Readonly<{
  intraday: EquityHistoryPoint[];
  chartSeries: number[];
  dayLow: number | null;
  dayHigh: number | null;
  exchangeTimezoneName: string | null;
  gmtoffset: number | null;
  timezone: string | null;
  ticker?: string | null;
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

function isBetterIntraday(candidate: EquityHistoryPoint[], current: EquityHistoryPoint[]): boolean {
  if (candidate.length < 2) return false;
  if (current.length < 2) return true;
  return candidate.length > current.length;
}

/** Today's OMX Copenhagen 25 session — five-minute resolution. */
export async function fetchDenmarkAvanzaIntraday(): Promise<EquityHistoryPoint[] | null> {
  const url = `https://www.avanza.se/_api/price-chart/stock/${DK_OMXC25_AVANZA_ORDERBOOK_ID}?timePeriod=today&resolution=five_minutes`;
  const json = await avanzaFetch<AvanzaPriceChartJson>(url);
  const points = downsampleIntraday(parseAvanzaIntraday(json?.ohlc ?? []));
  return points.length >= 2 ? points : null;
}

async function fetchDenmarkAvanzaSnapshot(): Promise<{ dayLow: number | null; dayHigh: number | null } | null> {
  const json = await avanzaFetch<AvanzaMarketIndexJson>(
    `https://www.avanza.se/_api/market-index/${DK_OMXC25_AVANZA_ORDERBOOK_ID}`,
  );
  if (!json) return null;
  const dayLow = json.quote?.lowest ?? null;
  const dayHigh = json.quote?.highest ?? null;
  if (dayLow == null && dayHigh == null) return null;
  return { dayLow, dayHigh };
}

/** Replace sparse Yahoo intraday for ^OMXC25 when Avanza has materially better coverage. */
export async function applyDenmarkAvanzaIntradayFallback<T extends YahooIntradaySnapshot>(
  snapshot: T,
  ticker: string,
): Promise<T> {
  if (ticker !== DK_YAHOO_TICKER) return snapshot;

  try {
    const [intraday, avanzaSnapshot] = await Promise.all([
      fetchDenmarkAvanzaIntraday(),
      snapshot.dayLow == null || snapshot.dayHigh == null ? fetchDenmarkAvanzaSnapshot() : Promise.resolve(null),
    ]);

    if (!intraday || !isBetterIntraday(intraday, snapshot.intraday)) {
      return snapshot;
    }

    const exchangeTz = exchangeTzFromRow({
      ticker: DK_YAHOO_TICKER,
      exchangeTimezoneName: snapshot.exchangeTimezoneName,
      gmtoffset: snapshot.gmtoffset,
      timezone: snapshot.timezone,
    });

    const dayRange = resolveDayHighLow({
      dayLow: snapshot.dayLow ?? avanzaSnapshot?.dayLow ?? null,
      dayHigh: snapshot.dayHigh ?? avanzaSnapshot?.dayHigh ?? null,
      intraday,
      exchangeTz,
    });

    return {
      ...snapshot,
      intraday,
      chartSeries: intraday.map((p) => p.price),
      dayLow: dayRange.dayLow,
      dayHigh: dayRange.dayHigh,
    };
  } catch {
    return snapshot;
  }
}
