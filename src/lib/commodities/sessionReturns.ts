/**
 * Shared session-based return lookbacks for Commodities Overview + Market Signals.
 *
 * Chart windows count closes (e.g. 21 closes ≈ 1M). List/Signals 1M returns use
 * N−1 session steps so (last − first) / first matches the visible chart period.
 * Nordic SYS uses calendar-day lookbacks elsewhere — do not use these helpers for it.
 */

export type SessionPricePoint = {
  date: string;
  price: number;
};

/** Visible daily closes in the price-history chart window. */
export const COMMODITY_CHART_WINDOW_SESSIONS = {
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
} as const;

/**
 * Session steps from latest close to the prior close for list/Signals returns.
 * Equals chart window − 1 (first→last of an N-close window).
 */
export const COMMODITY_SESSION_RETURN_STEPS = {
  "1W": 5,
  "1M": COMMODITY_CHART_WINDOW_SESSIONS["1M"] - 1,
  "1Y": COMMODITY_CHART_WINDOW_SESSIONS["1Y"] - 1,
} as const;

export type CommoditySessionReturnHorizon = keyof typeof COMMODITY_SESSION_RETURN_STEPS;

/**
 * Last close vs close `sessionsBack` trading sessions earlier.
 * Uses series end close (not a live last) so Overview and Signals stay aligned.
 */
export function sessionLookbackReturn(
  series: readonly SessionPricePoint[],
  sessionsBack: number,
): {
  asOf: string;
  priorDate: string;
  currentPrice: number;
  priorPrice: number;
  /** Signed fraction (e.g. −0.16), not percent points. */
  ret: number;
} | null {
  if (sessionsBack < 1 || series.length < sessionsBack + 1) return null;
  const latest = series[series.length - 1];
  const prior = series[series.length - 1 - sessionsBack];
  if (!latest || !prior) return null;
  if (!(latest.price > 0) || !(prior.price > 0)) return null;
  return {
    asOf: latest.date,
    priorDate: prior.date,
    currentPrice: latest.price,
    priorPrice: prior.price,
    ret: latest.price / prior.price - 1,
  };
}

/** Percent points for Overview table display (matches legacy `percentChange` scale). */
export function sessionLookbackReturnPct(
  series: readonly SessionPricePoint[],
  sessionsBack: number,
): number | null {
  const move = sessionLookbackReturn(series, sessionsBack);
  return move ? move.ret * 100 : null;
}

export function toSessionPricePoints(
  bars: readonly { date: string; close: number }[],
): SessionPricePoint[] {
  return bars.map((bar) => ({ date: bar.date, price: bar.close }));
}
