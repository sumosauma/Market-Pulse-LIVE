/**
 * Calendar-date lookbacks for Nord Pool SYS day-ahead prices.
 * SYS prints every calendar day — do not use business-session step counts.
 * Pure helpers only (safe for client + server).
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function stockholmParts(now: Date): { date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return {
    date: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
  };
}

/** Add calendar days (DST-safe via noon UTC anchor). */
export function stockholmDateOffset(baseDate: string, days: number): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const shifted = new Date(utc + days * 86_400_000);
  return stockholmParts(shifted).date;
}

/** Shift by whole calendar months; day clamped to month length. */
export function stockholmDateOffsetMonths(baseDate: string, months: number): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y!, m! - 1 + months, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d!, lastDay);
  return `${anchor.getUTCFullYear()}-${pad2(anchor.getUTCMonth() + 1)}-${pad2(day)}`;
}

export type NordicReturnHorizon = "1D" | "1W" | "1M" | "1Y";

/** Exact calendar reference delivery date for a Nordic SYS return horizon. */
export function nordicCalendarTargetDate(
  latestDeliveryDate: string,
  horizon: NordicReturnHorizon,
): string {
  switch (horizon) {
    case "1D":
      return stockholmDateOffset(latestDeliveryDate, -1);
    case "1W":
      return stockholmDateOffset(latestDeliveryDate, -7);
    case "1M":
      return stockholmDateOffsetMonths(latestDeliveryDate, -1);
    case "1Y":
      return stockholmDateOffsetMonths(latestDeliveryDate, -12);
  }
}

/**
 * % change vs the SYS price on the exact calendar target date.
 * Returns null when that delivery day is missing — never substitutes another date.
 */
export function nordicCalendarChangePct(
  series: readonly { date: string; price?: number; close?: number }[],
  horizon: NordicReturnHorizon,
): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1]!;
  const latestPx = latest.price ?? latest.close;
  if (typeof latestPx !== "number" || !(latestPx > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(latest.date)) {
    return null;
  }
  const target = nordicCalendarTargetDate(latest.date, horizon);
  const prior = series.find((row) => row.date === target);
  const priorPx = prior?.price ?? prior?.close;
  if (typeof priorPx !== "number" || !(priorPx > 0)) return null;
  return ((latestPx - priorPx) / priorPx) * 100;
}
