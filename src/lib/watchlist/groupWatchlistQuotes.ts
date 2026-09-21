import type { Quote } from "@/lib/markets.functions";

export type WatchlistSectionId =
  | "equities"
  | "rates"
  | "fx"
  | "commodities"
  | "volatility"
  | "crypto"
  | "other";

export const WATCHLIST_SECTIONS: ReadonlyArray<{
  id: WatchlistSectionId;
  title: string;
}> = [
  { id: "equities", title: "Equities / Indices" },
  { id: "rates", title: "Rates" },
  { id: "fx", title: "FX" },
  { id: "commodities", title: "Commodities and Inflation" },
  { id: "volatility", title: "Volatility / Risk" },
  { id: "crypto", title: "Crypto" },
  { id: "other", title: "Other" },
];

/** Map data-model category (+ label edge cases) to watchlist section. */
export function watchlistSectionIdForQuote(q: Quote): WatchlistSectionId {
  switch (q.category) {
    case "Equities":
      return "equities";
    case "Rates":
      return "rates";
    case "Forex":
      return "fx";
    case "Volatility":
      return "volatility";
    case "Inflation":
      // Brent, gold, and breakeven are all inflation-linked measures.
      return "commodities";
    default:
      if (/crypto/i.test(q.category)) return "crypto";
      return "other";
  }
}

/** Group quotes by section, preserving original watchlist order within each group. */
export function groupWatchlistQuotes(quotes: readonly Quote[]): Map<WatchlistSectionId, Quote[]> {
  const map = new Map<WatchlistSectionId, Quote[]>();
  for (const q of quotes) {
    const id = watchlistSectionIdForQuote(q);
    const bucket = map.get(id);
    if (bucket) bucket.push(q);
    else map.set(id, [q]);
  }
  return map;
}
