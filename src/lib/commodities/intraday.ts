/** Intraday Price History (1D chart) — separate from daily 1D% change. */

export type IntradayPoint = {
  /** ISO-8601 timestamp of the bar. */
  date: string;
  price: number;
};

export type IntradayInterval = "five_minutes";

export type IntradaySource = "avanza" | "yahoo-futures";

export type CommodityIntradaySeries = {
  id: string;
  points: IntradayPoint[];
  interval: IntradayInterval;
  source: IntradaySource | null;
  sourceLabel: string | null;
  /** Calendar date of the session shown (exchange/provider local when known). */
  sessionDate: string | null;
  exchangeTimezoneName: string | null;
  unavailableReason: string | null;
  stale: boolean;
};

export type CommodityIntradayPayload = {
  series: CommodityIntradaySeries[];
  fetchedAt: string;
  fromStaleCache: boolean;
};

/** Minimum verified 5-minute bars before the 1D chip is enabled. */
export const INTRADAY_MIN_POINTS = 24;

export function isIntradayEnabled(row: CommodityIntradaySeries | undefined): boolean {
  return !!row && row.points.length >= INTRADAY_MIN_POINTS && row.unavailableReason == null;
}
