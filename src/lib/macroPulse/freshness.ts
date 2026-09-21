import type { MacroPulseIndicatorId } from "./types";

type ReleaseRule =
  | { kind: "day_of_month"; day: number; graceDays: number }
  | { kind: "first_friday"; graceDays: number }
  | { kind: "nth_business_day"; nth: number; graceDays: number };

const RELEASE_RULES: Record<MacroPulseIndicatorId, ReleaseRule> = {
  "us-core-cpi": { kind: "day_of_month", day: 13, graceDays: 7 },
  "us-core-pce": { kind: "day_of_month", day: 28, graceDays: 7 },
  "ea-core-hicp": { kind: "day_of_month", day: 18, graceDays: 7 },
  "se-kpif": { kind: "day_of_month", day: 12, graceDays: 10 },
  "us-nfp": { kind: "first_friday", graceDays: 5 },
  "us-unemployment": { kind: "first_friday", graceDays: 5 },
  "se-unemployment": { kind: "day_of_month", day: 15, graceDays: 10 },
  "ism-manufacturing-pmi": { kind: "nth_business_day", nth: 1, graceDays: 5 },
  "ism-services-pmi": { kind: "nth_business_day", nth: 3, graceDays: 5 },
};

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function firstFridayUtc(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function nthBusinessDayUtc(year: number, month: number, nth: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (count < nth) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    if (count < nth) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function releasePassedForMonth(now: Date, rule: ReleaseRule): boolean {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (rule.kind === "first_friday") {
    return now.getTime() >= firstFridayUtc(y, m).getTime();
  }
  if (rule.kind === "nth_business_day") {
    return now.getTime() >= nthBusinessDayUtc(y, m, rule.nth).getTime();
  }
  return now.getTime() >= Date.UTC(y, m - 1, rule.day, 14, 0, 0);
}

/** Latest observation month that should be published as of `now`. */
export function expectedObservationMonth(indicatorId: MacroPulseIndicatorId, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const rule = RELEASE_RULES[indicatorId];

  let releasePassed = false;
  if (rule.kind === "first_friday") {
    const release = firstFridayUtc(y, m);
    releasePassed = now.getTime() >= release.getTime();
  } else if (rule.kind === "nth_business_day") {
    const release = nthBusinessDayUtc(y, m, rule.nth);
    releasePassed = now.getTime() >= release.getTime();
  } else {
    const release = Date.UTC(y, m - 1, rule.day, 14, 0, 0);
    releasePassed = now.getTime() >= release;
  }

  const currentYm = `${y}-${String(m).padStart(2, "0")}`;
  return releasePassed ? addMonths(currentYm, -1) : addMonths(currentYm, -2);
}

/** True when observation is older than the latest expected official release. */
export function isObservationStale(
  indicatorId: MacroPulseIndicatorId,
  observationDate: string,
  now: Date,
): boolean {
  const obsYm = monthKey(observationDate);
  const expectedYm = expectedObservationMonth(indicatorId, now);
  if (obsYm < expectedYm) return true;

  const rule = RELEASE_RULES[indicatorId];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;

  let releaseMs: number;
  if (rule.kind === "first_friday") {
    releaseMs = firstFridayUtc(y, m).getTime();
  } else if (rule.kind === "nth_business_day") {
    releaseMs = nthBusinessDayUtc(y, m, rule.nth).getTime();
  } else {
    releaseMs = Date.UTC(y, m - 1, rule.day, 14, 0, 0);
  }

  const graceMs = rule.graceDays * 86_400_000;
  const pastGrace = now.getTime() > releaseMs + graceMs;
  const expectedForCycle = releasePassedForMonth(now, rule)
    ? addMonths(`${y}-${String(m).padStart(2, "0")}`, -1)
    : addMonths(`${y}-${String(m).padStart(2, "0")}`, -2);

  return pastGrace && obsYm < expectedForCycle;
}

/** True when a scheduled next release is today or already in the past. */
export function isNextReleaseDue(nextReleaseDate: string | null | undefined, now: Date): boolean {
  if (!nextReleaseDate) return false;
  return nextReleaseDate.slice(0, 10) <= now.toISOString().slice(0, 10);
}

/**
 * Memory/disk snapshots must be refetched when TTL expires, the observation is stale,
 * or the scheduled next release has arrived (so we do not sit on July through a 6h TTL
 * after the August print is out).
 */
export function shouldReuseCachedSnapshot(args: {
  cachedAt: number;
  now: Date;
  ttlMs: number;
  indicatorId: MacroPulseIndicatorId;
  observationDate: string | null | undefined;
  nextReleaseDate: string | null | undefined;
}): boolean {
  if (args.now.getTime() - args.cachedAt >= args.ttlMs) return false;
  if (isNextReleaseDue(args.nextReleaseDate, args.now)) return false;
  if (args.observationDate && isObservationStale(args.indicatorId, args.observationDate, args.now)) {
    return false;
  }
  return true;
}

/** Keep the newer monthly observation; never let an older fallback replace it. */
export function preferNewerObservationDate(
  primaryDate: string | null | undefined,
  fallbackDate: string | null | undefined,
): "primary" | "fallback" | "none" {
  if (!primaryDate && !fallbackDate) return "none";
  if (!primaryDate) return "fallback";
  if (!fallbackDate) return "primary";
  return monthKey(primaryDate) >= monthKey(fallbackDate) ? "primary" : "fallback";
}
