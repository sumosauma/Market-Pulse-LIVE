/**
 * NQZA (^NQZA) intraday via Avanza public JSON — Yahoo 30m is sparse (afternoon-only).
 *
 * Daily history and live price remain Yahoo + FRED in nqzaFredSource.ts.
 * Unofficial Avanza frontend API — easy to remove; not used for any other market.
 */

import type { EquityHistoryPoint } from "../types";

export const NQZA_AVANZA_ORDERBOOK_ID = "134950";

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; MarketPulse-NQZA-Avanza/1.0)";

type AvanzaOhlcBar = Readonly<{
  timestamp?: number;
  close?: number;
}>;

type AvanzaPriceChartJson = Readonly<{
  ohlc?: readonly AvanzaOhlcBar[];
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

/** Prefer Avanza when it has more valid session bars than Yahoo. */
export function isBetterNqzaIntraday(
  candidate: readonly EquityHistoryPoint[],
  current: readonly EquityHistoryPoint[],
): boolean {
  if (candidate.length < 2) return false;
  if (current.length < 2) return true;
  return candidate.length > current.length;
}

/** Today's NQZA session — five-minute resolution. */
export async function fetchNqzaAvanzaIntraday(): Promise<EquityHistoryPoint[] | null> {
  try {
    const url = `https://www.avanza.se/_api/price-chart/stock/${NQZA_AVANZA_ORDERBOOK_ID}?timePeriod=today&resolution=five_minutes`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as AvanzaPriceChartJson;
    const points = downsampleIntraday(parseAvanzaIntraday(json.ohlc ?? []));
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}
