import type { YieldComparisonId } from "./types";

export function addUtcDays(dateIsoYYYYMMDD: string, deltaDays: number): string {
  const d = new Date(`${dateIsoYYYYMMDD}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function pickPriorSessionDate(calendarAsc: string[], latestDate: string): string | null {
  const i = calendarAsc.findIndex((d) => d === latestDate);
  return i > 0 ? calendarAsc[i - 1]! : null;
}

/** Calendar target for comparison — mirrors U.S. Treasury resolveComparisonObservation targets. */
export function resolveComparisonTargetDate(
  latestDate: string,
  comparisonId: YieldComparisonId,
  sessionCalendarAsc?: string[],
): { target: string; mode: string } {
  switch (comparisonId) {
    case "Today": {
      const prior =
        sessionCalendarAsc?.length && sessionCalendarAsc.length > 0
          ? pickPriorSessionDate(sessionCalendarAsc, latestDate)
          : null;
      return { target: prior ?? "prior-session", mode: "prior-session" };
    }
    case "1D":
      return { target: addUtcDays(latestDate, -1), mode: "calendar-minus-1" };
    case "1W":
      return { target: addUtcDays(latestDate, -7), mode: "calendar-minus-7" };
    case "1M":
      return { target: addUtcDays(latestDate, -31), mode: "calendar-minus-31" };
    case "3M":
      return { target: addUtcDays(latestDate, -93), mode: "calendar-minus-93" };
    case "1Y":
      return { target: addUtcDays(latestDate, -366), mode: "calendar-minus-366" };
    default:
      return { target: "", mode: "unknown" };
  }
}

export function nearestObservationOnOrBefore<T extends { date: string }>(
  rowsAsc: readonly T[],
  targetDateIso: string,
): T | null {
  if (!targetDateIso) return null;
  let best: T | null = null;
  for (const r of rowsAsc) {
    if (r.date <= targetDateIso) best = r;
    else break;
  }
  return best;
}

export type YieldChartScaleMode = "auto" | "shared";

/** Padded Y domain for single-country view — avoids over-zoomed misleading curves. */
export function computeAutoYieldYDomain(
  values: readonly (number | null | undefined)[],
): [number, number] | undefined {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return undefined;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(max - min, 0.15);
  const pad = Math.max(span * 0.12, 0.08);

  return [min - pad, max + pad];
}

/** Shared Y domain for multi-country overlay — same padding rules as auto, wider value pool. */
export function computeSharedYieldYDomain(
  values: readonly (number | null | undefined)[],
): [number, number] | undefined {
  return computeAutoYieldYDomain(values);
}
