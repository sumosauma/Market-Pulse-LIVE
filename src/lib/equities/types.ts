export type EquityMarketStatus = "market_open" | "market_closed" | "unavailable" | "stale";

export type EquityHistoryPoint = Readonly<{
  date: string;
  price: number;
}>;

export type EquityMarketConfig = Readonly<{
  countryId: string;
  countryName: string;
  iso2: string;
  iso3: string;
  /** ISO 3166-1 numeric — matches world-atlas country id. */
  isoNumeric: string;
  region: string;
  indexName: string;
  ticker: string;
  source: string;
  /** When true, a live fetch is attempted. When false, shown as unavailable. */
  isLive: boolean;
  /** Label on Market Overview if already wired (informational). */
  overviewQuoteLabel?: string;
}>;

export type EquityMarketQuote = Readonly<{
  countryId: string;
  price: number | null;
  changePercent: number | null;
  /** Session low / high from Yahoo regular market. */
  dayLow?: number | null;
  dayHigh?: number | null;
  /** Daily closes from Yahoo (up to 1y) — chart uses recent subset; metrics use full series. */
  history?: readonly EquityHistoryPoint[];
  /** 30m bars (~5d) with ISO timestamps — used for 1D chart view. */
  intraday?: readonly EquityHistoryPoint[];
  /** Intraday (or daily fallback) price-only series — legacy metric fallback. */
  chartSeries?: readonly number[];
  /** Yahoo exchange timezone — used for 1D session grouping and labels. */
  exchangeTimezoneName?: string | null;
  /** Seconds east of UTC (Yahoo gmtoffset). */
  gmtoffset?: number | null;
  /** Short timezone label from Yahoo (e.g. JST). */
  timezone?: string | null;
  status: EquityMarketStatus;
  source: string;
  error?: string;
}>;

export type EquityMarketsPayload = Readonly<{
  quotes: EquityMarketQuote[];
  fetchedAt: string;
}>;

export type EquityMarketRow = EquityMarketConfig &
  EquityMarketQuote & {
    displayStatus: string;
  };
