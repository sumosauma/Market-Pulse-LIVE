import type { Quote } from "@/lib/markets.functions";

/** React Query key — bump when Quote schema changes. */
export const MARKETS_QUERY_KEY = ["markets", "v4"] as const;

/** Normalize CBOE `MM/DD/YYYY` (or variants) to ISO `YYYY-MM-DD`. */
export function normalizeMarketDate(date: string): string {
  const slash = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    return `${slash[3]}-${mm}-${dd}`;
  }
  return date.slice(0, 10);
}

export function formatQuoteObservationDate(date: string): string {
  const iso = normalizeMarketDate(date);
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Card sublabel, e.g. `FRED EOD · Jun 16` or `ECB ref · Jun 17 · cached`. */
export function formatQuoteSourceDisplay(q: Quote): string | null {
  const parts: string[] = [];
  if (q.sourceLabel) parts.push(q.sourceLabel);
  if (q.observationDate) parts.push(formatQuoteObservationDate(q.observationDate));
  if (q.fromStaleCache) parts.push("cached");
  if (!parts.length) return null;
  return parts.join(" · ");
}
