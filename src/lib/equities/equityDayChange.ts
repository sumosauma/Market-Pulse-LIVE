/** Day-over-day % change from daily history — Yahoo-style prior close baseline. */

const CLOSE_EQUAL_ABS = 1e-4;
const CLOSE_EQUAL_REL = 1e-9;

function validDailyCloses(history: readonly { price: number }[]): number[] {
  return history.map((p) => p.price).filter((p) => typeof p === "number" && Number.isFinite(p));
}

/** True when two daily closes are equal within absolute or relative tolerance. */
function dailyClosesNearlyEqual(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff < CLOSE_EQUAL_ABS) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && diff / scale < CLOSE_EQUAL_REL;
}

/**
 * Prior close for 1D % — normally second-to-last bar.
 * When Yahoo repeats the latest daily close (stale duplicate session bar) and live
 * matches that duplicate, walk back to the most recent earlier distinct close.
 */
function selectPreviousDailyClose(closes: readonly number[], current: number): number | null {
  if (closes.length < 2) return null;

  const latest = closes[closes.length - 1]!;
  const secondLatest = closes[closes.length - 2]!;

  const duplicateLatestBar =
    closes.length >= 3 &&
    dailyClosesNearlyEqual(latest, secondLatest) &&
    dailyClosesNearlyEqual(current, latest);

  if (!duplicateLatestBar) return secondLatest;

  for (let i = closes.length - 3; i >= 0; i--) {
    if (!dailyClosesNearlyEqual(closes[i]!, latest)) {
      return closes[i]!;
    }
  }

  return secondLatest;
}

/**
 * 1D % vs the close before the latest daily bar.
 * Uses live price when available; otherwise latest daily close.
 */
export function change1dPercentFromDailyHistory(
  history: readonly { price: number }[],
  livePrice?: number | null,
): number | null {
  const closes = validDailyCloses(history);
  if (closes.length < 2) return null;

  const latestDailyClose = closes[closes.length - 1]!;
  const current =
    livePrice != null && Number.isFinite(livePrice) ? livePrice : latestDailyClose;

  const previousDailyClose = selectPreviousDailyClose(closes, current);
  if (previousDailyClose == null || previousDailyClose <= 0) return null;

  return ((current - previousDailyClose) / previousDailyClose) * 100;
}

/** 1D % for a merged equity row — same logic as fetch / map / table. */
export function change1dPercentForRow(row: {
  price: number | null;
  history?: readonly { price: number }[];
  changePercent?: number | null;
  countryId?: string;
}): number | null {
  if (row.countryId === "ZA" && row.changePercent != null && Number.isFinite(row.changePercent)) {
    return row.changePercent;
  }
  return change1dPercentFromDailyHistory(row.history ?? [], row.price);
}

/** ~1 calendar month on the 1M chart / summary stats. */
export const EQUITY_1M_TRADING_DAYS = 21;

export function lastEquityPrice(row: {
  price: number | null;
  history?: readonly { price: number }[];
}): number | null {
  const history = row.history ?? [];
  return row.price ?? history[history.length - 1]?.price ?? null;
}

/** % change vs the close N trading days ago. */
export function changeOverTradingDays(
  row: { price: number | null; history?: readonly { price: number }[] },
  days: number,
): number | null {
  const history = row.history ?? [];
  const last = lastEquityPrice(row);
  if (history.length < days + 1 || last === null) return null;

  const base = history[history.length - 1 - days]?.price;
  if (base == null || base <= 0) return null;
  return ((last - base) / base) * 100;
}

export function change1mPercent(row: {
  price: number | null;
  history?: readonly { price: number }[];
}): number | null {
  return changeOverTradingDays(row, EQUITY_1M_TRADING_DAYS);
}
