export interface HistoryPoint {
  date: string;
  price: number;
}

export type QuoteDataKind = "intraday" | "EOD" | "reference" | "delayed";

export interface Quote {
  symbol: string;
  label: string;
  category: string;
  unit?: string;
  /** Human-readable source, e.g. `FRED EOD`, `ECB ref`, `CBOE prior close`. */
  sourceLabel?: string;
  /** Latest observation date (ISO `YYYY-MM-DD` when known). */
  observationDate?: string;
  dataKind?: QuoteDataKind;
  /** True when price is replayed from an expired in-memory cache after fetch failure. */
  fromStaleCache?: boolean;
  // Displayed card price. For Gold when using GC=F fallback this is the live spot
  // price; changePercent/5d are still calculated from the GC=F calculation price.
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  // 6 points (oldest → newest) used solely for 5D performance calculation.
  history: HistoryPoint[];
  // Richer series for the sparkline — separate from `history`.
  // Intraday (30 m) for Yahoo tickers; daily (20–30 pts) for EOD sources.
  // Falls back to `history` in the UI when absent.
  chartData?: HistoryPoint[];
  change5d: number | null;
  changePercent5d: number | null;
  /** Absolute change vs ~21 sessions ago — yield units for rates, price units otherwise. */
  change1m: number | null;
  changePercent1m: number | null;
  /** Absolute change vs ~252 sessions ago — yield units for rates, price units otherwise. */
  change1y: number | null;
  changePercent1y: number | null;
  range5d: { min: number; max: number } | null;
  // Positive = consecutive up sessions, negative = down, 0 = flat/mixed
  streak: number | null;
  // Intraday day range — available for Yahoo/GC=F sources; null for EOD-only sources.
  low: number | null;
  high: number | null;
  error?: string;
}

export type MarketsPayload = {
  quotes: Quote[];
  fetchedAt: string;
  fromStaleCache?: boolean;
};

/** Keep in sync with Dashboard client staleTime and server SWR TTL. */
export const MARKETS_CACHE_MS = 60_000;
