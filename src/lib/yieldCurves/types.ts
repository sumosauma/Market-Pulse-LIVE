/** Curve display series (Treasury BCM column mapping for US). */
export const YIELD_CURVE_MATURITIES = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "10Y", "30Y"] as const;

export const YIELD_MATURITY_YEAR_FRACTION = {
  "1M": 1 / 12,
  "3M": 0.25,
  "6M": 0.5,
  "1Y": 1,
  "2Y": 2,
  "5Y": 5,
  "10Y": 10,
  "30Y": 30,
} as const satisfies Record<(typeof YIELD_CURVE_MATURITIES)[number], number>;

export type YieldMaturity = (typeof YIELD_CURVE_MATURITIES)[number];

/** Sovereign countries with live or planned yield-curve support. */
export type SovereignCountryId = "US" | "SE" | "NO" | "CN" | "GB";

/** Official-only registry: a grid point is published officially or absent. */
export type MaturityCoverageStatus = "official" | "missing";

export type YieldComparisonId = "Today" | "1D" | "1W" | "1M" | "3M" | "1Y";

/** Yield Curves page view mode. */
export type YieldCurveViewMode = "time" | "country";

/** How a maturity’s yield was obtained — sovereign curve only. */
export type YieldPointSourceType = "official" | "external" | "interpolated" | "missing" | "unavailable";

export type YieldCurveKind = "par" | "zeroCoupon" | "benchmark";

/**
 * One sovereign yield observation at a maturity on a single date.
 * Used for UI metadata and future multi-country completion/interpolation.
 */
export type YieldCurvePoint = Readonly<{
  country: SovereignCountryId;
  maturity: string;
  years: number;
  yield: number | null;
  date: string;
  source: string;
  sourceType: YieldPointSourceType;
  curveType: YieldCurveKind;
  methodologyNote?: string;
  /** Maturity labels used when sourceType is interpolated. */
  basedOn?: readonly string[];
}>;

/** Compact per-maturity legs stored in snapshots and caches (US Treasury today). */
export type YieldCurveSnapshotPoint = Readonly<{
  maturity: string;
  years: number;
  currentYield: number | null;
  comparisonYield: number | null;
  changeBps: number | null;
}>;

/** Row for charts, tables, and summary cards. */
export interface YieldCurveRowView {
  maturity: YieldMaturity;
  years: number;
  currentYield: number | null;
  comparisonYield: number | null;
  changeBps: number | null;
  current: YieldCurvePoint;
  comparison: YieldCurvePoint;
}

/** Official snapshot envelope (persist + API result). */
export type YieldCurveSnapshot = Readonly<{
  /** Present on new snapshots; omitted in older disk/browser caches. */
  countryId?: SovereignCountryId;
  country: string;
  date: string;
  comparisonDate: string;
  source:
    | "U.S. Treasury"
    | "Riksbank"
    | "Millistream/DI"
    | "Norges Bank"
    | "Bank of England"
    | "ChinaBond / CCDC"
    | "Mock (illustrative)";
  updatedAt: string;
  points: YieldCurveSnapshotPoint[];
  /** Official maturities that failed to load this session (distinct from structurally missing). */
  unavailableMaturities?: readonly YieldMaturity[];
}>;

/** Row for country-vs-country comparison table. */
export type YieldCurveCountryCompareRow = Readonly<{
  maturity: YieldMaturity;
  primaryYield: number | null;
  compareYield: number | null;
  /** Primary yield minus compare yield, in basis points. */
  spreadBps: number | null;
  primarySourceType: YieldPointSourceType;
  compareSourceType: YieldPointSourceType;
}>;

export type CurveMoveLabel =
  | "Bear steepening"
  | "Bear flattening"
  | "Bull steepening"
  | "Bull flattening"
  | "Parallel shift"
  | "Mixed move";

/** @deprecated Mock-only — do not use for live sovereign curves. */
export type YieldCurveByMaturity = Record<YieldMaturity, number>;

export type USTYieldDataSourceTag =
  | "treasury-live"
  | "treasury-disk-cache"
  | "browser-local-storage"
  | "mock-fallback"
  | "unavailable";

/** Keys we read from treasury.gov XML `<d:BC_*>` properties. */
export type USTXmlFieldKey =
  | "BC_1MONTH"
  | "BC_3MONTH"
  | "BC_6MONTH"
  | "BC_1YEAR"
  | "BC_2YEAR"
  | "BC_5YEAR"
  | "BC_10YEAR"
  | "BC_30YEAR";

/** One Treasury XML row normalized (BC_* fields omitted if missing). */
export type ParsedUSTDay = Readonly<{
  date: string;
  yields: Partial<Record<USTXmlFieldKey, number>>;
}>;

export type GetUSTYieldCurveResponse = Readonly<{
  snapshot: YieldCurveSnapshot | null;
  rowsAsc: ParsedUSTDay[];
  errorMessage: string | null;
  dataSourceTag: USTYieldDataSourceTag;
  updatedAtISO: string;
}>;

export type SwedenYieldDataSourceTag =
  | "di-live"
  | "di-disk-cache"
  | "browser-local-storage"
  | "unavailable";

/** One official Riksbank SWEA series history (ascending by date). */
export type ParsedSwedenRiksbankSeries = Readonly<{
  maturity: YieldMaturity;
  seriesId: string;
  rows: ReadonlyArray<{ date: string; value: number }>;
}>;

/** Combined Sweden yield-curve history from Riksbank SWEA. */
export type ParsedSwedenRiksbankHistory = Readonly<{
  fetchedAt: string;
  series: readonly ParsedSwedenRiksbankSeries[];
  /** Official maturities whose SWEA fetch failed (partial history). */
  failedMaturities?: readonly YieldMaturity[];
}>;

export type GetSwedenYieldHistoryResponse = Readonly<{
  history: ParsedSwedenRiksbankHistory | null;
  errorMessage: string | null;
  dataSourceTag: SwedenYieldDataSourceTag;
  updatedAtISO: string;
  cacheSavedAtISO: string | null;
}>;

export type GetSwedenYieldCurveResponse = Readonly<{
  snapshot: YieldCurveSnapshot | null;
  history: ParsedSwedenRiksbankHistory | null;
  errorMessage: string | null;
  dataSourceTag: SwedenYieldDataSourceTag;
  updatedAtISO: string;
}>;

export type NorwayYieldDataSourceTag =
  | "norgesbank-live"
  | "norgesbank-disk-cache"
  | "browser-local-storage"
  | "unavailable";

export type NorwayNorgesBankProduct = "generic" | "zeroCoupon";

export type ParsedNorwayNorgesBankSeries = Readonly<{
  maturity: YieldMaturity;
  datasetId: string;
  seriesKey: string;
  product: NorwayNorgesBankProduct;
  rows: ReadonlyArray<{ date: string; value: number }>;
}>;

export type ParsedNorwayNorgesBankHistory = Readonly<{
  fetchedAt: string;
  series: readonly ParsedNorwayNorgesBankSeries[];
  failedMaturities?: readonly YieldMaturity[];
}>;

export type GetNorwayYieldHistoryResponse = Readonly<{
  history: ParsedNorwayNorgesBankHistory | null;
  errorMessage: string | null;
  dataSourceTag: NorwayYieldDataSourceTag;
  updatedAtISO: string;
  cacheSavedAtISO: string | null;
}>;

export type UkYieldDataSourceTag =
  | "boe-live"
  | "boe-disk-cache"
  | "browser-local-storage"
  | "unavailable";

export type ParsedUkBankOfEnglandSeries = Readonly<{
  maturity: YieldMaturity;
  rows: ReadonlyArray<{ date: string; value: number }>;
}>;

export type ParsedUkBankOfEnglandHistory = Readonly<{
  fetchedAt: string;
  /** Official BoE workbook names parsed (latest + archive segments). */
  sourceFiles: readonly string[];
  series: readonly ParsedUkBankOfEnglandSeries[];
  failedMaturities?: readonly YieldMaturity[];
}>;

export type GetUkYieldHistoryResponse = Readonly<{
  history: ParsedUkBankOfEnglandHistory | null;
  errorMessage: string | null;
  dataSourceTag: UkYieldDataSourceTag;
  updatedAtISO: string;
  cacheSavedAtISO: string | null;
}>;

export type ChinaYieldDataSourceTag =
  | "chinabond-live"
  | "chinabond-disk-cache"
  | "browser-local-storage"
  | "unavailable";

export type ParsedChinaChinaBondSeries = Readonly<{
  maturity: YieldMaturity;
  rows: ReadonlyArray<{ date: string; value: number }>;
}>;

export type ParsedChinaChinaBondHistory = Readonly<{
  fetchedAt: string;
  sourceEndpoint: string;
  series: readonly ParsedChinaChinaBondSeries[];
  failedMaturities?: readonly YieldMaturity[];
}>;

export type GetChinaYieldHistoryResponse = Readonly<{
  history: ParsedChinaChinaBondHistory | null;
  errorMessage: string | null;
  dataSourceTag: ChinaYieldDataSourceTag;
  updatedAtISO: string;
  cacheSavedAtISO: string | null;
}>;
