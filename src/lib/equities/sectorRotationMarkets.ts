import type { SectorBasket } from "./usSectorRotation";

export const SECTOR_MARKET_IDS = ["US", "SE"] as const;
export type SectorMarketId = (typeof SECTOR_MARKET_IDS)[number];

/**
 * Swedish sectors are Nasdaq Stockholm ICB industry price indices (PI).
 * They use the same 11 dashboard labels as the US GICS sectors, but ICB is not GICS.
 *
 * Communication Services is OMX Stockholm Telecommunications PI (SX15PI).
 * ICB has no Communication Services industry. Media stays inside Consumer
 * Discretionary (SX40PI) and is not blended into Telecommunications.
 *
 * Materials is Basic Materials PI (SX55PI). That industry index already
 * includes chemicals and basic resources, so those sub-indices are not combined again.
 *
 * No Swedish category is an average or blend of more than one index.
 * Every series below is a price index, matching the unadjusted closes used for US ETFs.
 * Gross (GI) total-return indices are not used.
 */
export type SectorSeriesSource =
  | Readonly<{ kind: "yahoo"; symbol: string }>
  | Readonly<{ kind: "fred"; seriesId: string }>;

export type SectorDefinition = Readonly<{
  name: string;
  symbol: string;
  basket: SectorBasket;
  source: SectorSeriesSource;
}>;

export type SectorMarketConfig = Readonly<{
  id: SectorMarketId;
  toggleLabel: string;
  subtitle: string;
  benchmarkName: string;
  benchmarkColumn: string;
  benchmark: SectorDefinition;
  sectors: readonly SectorDefinition[];
}>;

/** Shared row order for every market. Do not sort the table by performance. */
export const SECTOR_DISPLAY_ORDER = [
  "Technology",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Materials",
  "Health Care",
  "Consumer Staples",
  "Utilities",
  "Energy",
  "Real Estate",
] as const;

const US_SECTORS: readonly SectorDefinition[] = [
  { name: "Technology", symbol: "XLK", basket: "cyclical", source: { kind: "yahoo", symbol: "XLK" } },
  { name: "Financials", symbol: "XLF", basket: "cyclical", source: { kind: "yahoo", symbol: "XLF" } },
  { name: "Consumer Discretionary", symbol: "XLY", basket: "cyclical", source: { kind: "yahoo", symbol: "XLY" } },
  { name: "Communication Services", symbol: "XLC", basket: "cyclical", source: { kind: "yahoo", symbol: "XLC" } },
  { name: "Industrials", symbol: "XLI", basket: "cyclical", source: { kind: "yahoo", symbol: "XLI" } },
  { name: "Materials", symbol: "XLB", basket: "cyclical", source: { kind: "yahoo", symbol: "XLB" } },
  { name: "Health Care", symbol: "XLV", basket: "defensive", source: { kind: "yahoo", symbol: "XLV" } },
  { name: "Consumer Staples", symbol: "XLP", basket: "defensive", source: { kind: "yahoo", symbol: "XLP" } },
  { name: "Utilities", symbol: "XLU", basket: "defensive", source: { kind: "yahoo", symbol: "XLU" } },
  { name: "Energy", symbol: "XLE", basket: "other", source: { kind: "yahoo", symbol: "XLE" } },
  { name: "Real Estate", symbol: "XLRE", basket: "other", source: { kind: "yahoo", symbol: "XLRE" } },
];

const SE_SECTORS: readonly SectorDefinition[] = [
  { name: "Technology", symbol: "SX10PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX10PI" } },
  { name: "Financials", symbol: "SX30PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX30PI" } },
  { name: "Consumer Discretionary", symbol: "SX40PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX40PI" } },
  { name: "Communication Services", symbol: "SX15PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX15PI" } },
  { name: "Industrials", symbol: "SX50PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX50PI" } },
  { name: "Materials", symbol: "SX55PI", basket: "cyclical", source: { kind: "fred", seriesId: "NASDAQSX55PI" } },
  { name: "Health Care", symbol: "SX20PI", basket: "defensive", source: { kind: "fred", seriesId: "NASDAQSX20PI" } },
  { name: "Consumer Staples", symbol: "SX45PI", basket: "defensive", source: { kind: "fred", seriesId: "NASDAQSX45PI" } },
  { name: "Utilities", symbol: "SX65PI", basket: "defensive", source: { kind: "fred", seriesId: "NASDAQSX65PI" } },
  { name: "Energy", symbol: "SX60PI", basket: "other", source: { kind: "fred", seriesId: "NASDAQSX60PI" } },
  { name: "Real Estate", symbol: "SX35PI", basket: "other", source: { kind: "fred", seriesId: "NASDAQSX35PI" } },
];

export const SECTOR_MARKETS: Record<SectorMarketId, SectorMarketConfig> = {
  US: {
    id: "US",
    toggleLabel: "US",
    subtitle: "US sector leadership and relative performance",
    benchmarkName: "S&P 500",
    benchmarkColumn: "vs S&P 500",
    benchmark: {
      name: "S&P 500",
      symbol: "SPY",
      basket: "other",
      source: { kind: "yahoo", symbol: "SPY" },
    },
    sectors: US_SECTORS,
  },
  SE: {
    id: "SE",
    toggleLabel: "Sweden",
    subtitle: "Swedish sector leadership and relative performance",
    benchmarkName: "OMX Stockholm Benchmark",
    benchmarkColumn: "vs OMXSB",
    benchmark: {
      name: "OMX Stockholm Benchmark",
      symbol: "OMXSBPI",
      basket: "other",
      source: { kind: "fred", seriesId: "NASDAQOMXSBPI" },
    },
    sectors: SE_SECTORS,
  },
};

export function sectorMarketConfig(market: SectorMarketId): SectorMarketConfig {
  return SECTOR_MARKETS[market];
}
