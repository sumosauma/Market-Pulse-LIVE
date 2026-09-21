import { exchangeLocalDateKey, type ExchangeTz } from "./equityExchangeTz";
import type { EquityHistoryPoint } from "./types";

/** Most recent exchange-local intraday session with at least two bars (matches 1D chart). */
export function intradayLastSession(
  intraday: readonly EquityHistoryPoint[],
  tz: ExchangeTz,
): EquityHistoryPoint[] {
  if (intraday.length === 0) return [];

  const byDay = new Map<string, EquityHistoryPoint[]>();
  for (const p of intraday) {
    const day = exchangeLocalDateKey(p.date, tz);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(p);
    else byDay.set(day, [p]);
  }

  const days = [...byDay.keys()].sort();
  for (let i = days.length - 1; i >= 0; i--) {
    const session = byDay.get(days[i]!)!;
    if (session.length >= 2) return session;
  }

  return [];
}

/** Session high/low from intraday closes — null when fewer than 2 session bars. */
export function sessionHighLowFromIntraday(
  intraday: readonly EquityHistoryPoint[],
  tz: ExchangeTz,
): { dayLow: number | null; dayHigh: number | null } {
  const session = intradayLastSession(intraday, tz);
  if (session.length < 2) return { dayLow: null, dayHigh: null };

  let dayLow = session[0]!.price;
  let dayHigh = session[0]!.price;
  for (const bar of session) {
    if (bar.price < dayLow) dayLow = bar.price;
    if (bar.price > dayHigh) dayHigh = bar.price;
  }

  return { dayLow, dayHigh };
}

/** Yahoo/meta day extreme — rejects zero and non-finite values. */
export function readDayExtreme(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Prefer explicit source values; fall back to latest intraday session. */
export function resolveDayHighLow(input: {
  dayLow?: number | null;
  dayHigh?: number | null;
  intraday?: readonly EquityHistoryPoint[];
  exchangeTz: ExchangeTz;
}): { dayLow: number | null; dayHigh: number | null } {
  const dayLow = input.dayLow ?? null;
  const dayHigh = input.dayHigh ?? null;

  if (dayLow != null && dayHigh != null) {
    return { dayLow, dayHigh };
  }

  const fromSession = sessionHighLowFromIntraday(input.intraday ?? [], input.exchangeTz);
  return {
    dayLow: dayLow ?? fromSession.dayLow,
    dayHigh: dayHigh ?? fromSession.dayHigh,
  };
}
