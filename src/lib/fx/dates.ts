import type { FxTimeframe } from "./types";

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()): string {
  return isoUTC(now);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoUTC(d);
}

export function addYearsISO(iso: string, years: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return isoUTC(d);
}

/** Calendar lookback for Frankfurter range queries (weekends/holidays included). */
export function rangeForTimeframe(timeframe: FxTimeframe, end = todayISO()): { from: string; to: string } {
  switch (timeframe) {
    case "1D":
      return { from: addDaysISO(end, -14), to: end };
    case "1W":
      return { from: addDaysISO(end, -10), to: end };
    case "1M":
      return { from: addDaysISO(end, -32), to: end };
    case "1Y":
      return { from: addDaysISO(end, -370), to: end };
    case "5Y":
      return { from: addYearsISO(end, -5), to: end };
  }
}
