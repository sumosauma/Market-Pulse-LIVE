import { changeFromBps, isoPlusDays, utcTodayIso, type PolicyRateRow } from "./types";

export type RatePoint = { date: string; value: number };

export type LastDecision = {
  changeBps: number;
  dateIso: string;
};

function sortedUnique(dates: string[]): string[] {
  return [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

function lastValueBefore(series: RatePoint[], exclusiveEnd: string): number | null {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.date < exclusiveEnd) return sorted[i]!.value;
  }
  return null;
}

function firstDateOnOrAfterWithValue(series: RatePoint[], fromInclusive: string, value: number): string | null {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const hit = sorted.find((p) => p.date >= fromInclusive && Math.abs(p.value - value) < 1e-6);
  return hit?.date ?? null;
}

/** Latest series snapshot — used for the live Rate column only. Does not walk for Last. */
export function latestRate(points: RatePoint[]): { value: number; asOf: string } {
  if (!points.length) throw new Error("No rate observations");
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]!;
  return { value: latest.value, asOf: latest.date };
}

/**
 * Last = most recent policy meeting vs the meeting immediately before it.
 * Hold → Unchanged + meeting date. Change → bp delta + date the new rate took effect.
 */
export function lastDecisionFromMeetingsAndSeries(
  meetingDates: string[],
  series: RatePoint[],
  today = utcTodayIso(),
): LastDecision {
  const past = sortedUnique(meetingDates).filter((d) => d <= today);
  if (past.length < 2) {
    throw new Error(`need two past meeting dates (got ${past.join(",") || "none"})`);
  }
  const latestMeeting = past[past.length - 1]!;
  const rateBefore = lastValueBefore(series, latestMeeting);
  const rateNow = lastValueBefore(series, isoPlusDays(today, 1));
  if (rateBefore == null || rateNow == null) {
    throw new Error("series missing values around the last two meetings");
  }
  const bps = Math.round((rateNow - rateBefore) * 100);
  if (bps === 0) {
    return { changeBps: 0, dateIso: latestMeeting };
  }
  const effective = firstDateOnOrAfterWithValue(series, latestMeeting, rateNow) ?? latestMeeting;
  return { changeBps: bps, dateIso: effective };
}

/** Two consecutive dated rate prints/decisions (already one row per decision). */
export function lastDecisionFromTwoPrints(latest: RatePoint, previous: RatePoint): LastDecision {
  const bps = Math.round((latest.value - previous.value) * 100);
  if (bps === 0) return { changeBps: 0, dateIso: latest.date };
  return { changeBps: bps, dateIso: latest.date };
}

export function lastChangeFields(last: LastDecision): NonNullable<PolicyRateRow["latestChange"]> {
  return changeFromBps(last.changeBps, last.dateIso)!;
}
