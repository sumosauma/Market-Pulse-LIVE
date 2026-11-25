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
