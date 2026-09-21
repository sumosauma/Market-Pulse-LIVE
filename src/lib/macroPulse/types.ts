export type MacroPulseSectionId = "inflation" | "labour" | "growth";

export type MacroPulseIndicatorId =
  | "us-core-cpi"
  | "us-core-pce"
  | "ea-core-hicp"
  | "se-kpif"
  | "us-nfp"
  | "us-unemployment"
  | "se-unemployment"
  | "ism-services-pmi"
  | "ism-manufacturing-pmi";

export type MacroPulseFreshness = "fresh" | "cached" | "stale" | "error";

export type MacroPulseDisplayKind = "yoy_mom" | "change_thousands" | "level_pct" | "index_pts";

export type MacroPulseChangeDirection = "up" | "down" | "flat";

export type MacroPulseRow = Readonly<{
  id: MacroPulseIndicatorId;
  section: MacroPulseSectionId;
  label: string;
  displayKind: MacroPulseDisplayKind;
  headlineValue: string | null;
  consensusDisplay: string | null;
  nextReleaseConsensusDisplay: string | null;
  consensusRevisionDisplay: string | null;
  consensusRevisionDirection: MacroPulseChangeDirection | null;
  consensusSourceUrl: string | null;
  changeVsPriorDisplay: string | null;
  changeSecondaryValue: string | null;
  changeReferenceDisplay: string | null;
  changeVsPriorDirection: MacroPulseChangeDirection | null;
  secondaryValue: string | null;
  metadataDisplay: string | null;
  nextReleaseDisplay: string | null;
  nextReleaseIsEstimated: boolean;
  nextReleaseDate: string | null;
  observationDate: string | null;
  source: string;
  sourceSeriesId: string;
  sourceUrl: string;
  freshness: MacroPulseFreshness;
  error: string | null;
}>;

export const MACRO_PULSE_SCHEMA_VERSION = 15;

export const MACRO_CONSENSUS_IDS = [
  "us-core-cpi",
  "us-core-pce",
  "ea-core-hicp",
  "se-kpif",
  "us-nfp",
  "us-unemployment",
  "se-unemployment",
  "ism-services-pmi",
  "ism-manufacturing-pmi",
] as const satisfies readonly MacroPulseIndicatorId[];

/** @deprecated Use MACRO_CONSENSUS_IDS — consensus is now wired for all 9 indicators. */
export const MACRO_INFLATION_CONSENSUS_IDS = MACRO_CONSENSUS_IDS;

export type MacroPulsePayload = Readonly<{
  schemaVersion: typeof MACRO_PULSE_SCHEMA_VERSION;
  rows: MacroPulseRow[];
  fetchedAt: string;
}>;

export type MacroIndicatorMeta = Readonly<{
  id: MacroPulseIndicatorId;
  section: MacroPulseSectionId;
  label: string;
  displayKind: MacroPulseDisplayKind;
  source: string;
  sourceSeriesId: string;
  sourceUrl: string;
}>;

export const MACRO_INDICATOR_ORDER: ReadonlyArray<MacroIndicatorMeta> = [
  {
    id: "us-core-cpi",
    section: "inflation",
    label: "US Core CPI",
    displayKind: "yoy_mom",
    source: "BLS / FRED",
    sourceSeriesId: "CPILFESL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPILFESL",
  },
  {
    id: "us-core-pce",
    section: "inflation",
    label: "US Core PCE",
    displayKind: "yoy_mom",
    source: "BEA / FRED",
    sourceSeriesId: "PCEPILFE",
    sourceUrl: "https://fred.stlouisfed.org/series/PCEPILFE",
  },
  {
    id: "ea-core-hicp",
    section: "inflation",
    label: "Euro Area Core HICP",
    displayKind: "yoy_mom",
    source: "Eurostat / FRED",
    sourceSeriesId: "TOTNRGFOODEA20MI15XM",
    sourceUrl: "https://fred.stlouisfed.org/series/TOTNRGFOODEA20MI15XM",
  },
  {
    id: "se-kpif",
    section: "inflation",
    label: "Sweden KPIF",
    displayKind: "yoy_mom",
    source: "SCB",
    sourceSeriesId: "TAB6590",
    sourceUrl: "https://www.scb.se/en/finding-statistics/statistics-by-subject-area/prices-and-economic-trends/price-statistics/consumer-price-index-cpi/",
  },
  {
    id: "us-nfp",
    section: "labour",
    label: "US Nonfarm Payrolls",
    displayKind: "change_thousands",
    source: "BLS / FRED",
    sourceSeriesId: "PAYEMS",
    sourceUrl: "https://fred.stlouisfed.org/series/PAYEMS",
  },
  {
    id: "us-unemployment",
    section: "labour",
    label: "US Unemployment Rate",
    displayKind: "level_pct",
    source: "BLS / FRED",
    sourceSeriesId: "UNRATE",
    sourceUrl: "https://fred.stlouisfed.org/series/UNRATE",
  },
  {
    id: "se-unemployment",
    section: "labour",
    label: "Sweden Unemployment Rate",
    displayKind: "level_pct",
    source: "SCB",
    sourceSeriesId: "TAB6387",
    sourceUrl: "https://www.scb.se/en/finding-statistics/statistics-by-subject-area/labour-market/labour-force-supply/labour-force-surveys-lfs/",
  },
  {
    id: "ism-services-pmi",
    section: "growth",
    label: "ISM Services PMI",
    displayKind: "index_pts",
    source: "ISM",
    sourceSeriesId: "ISM-SERVICES-PMI",
    sourceUrl:
      "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/",
  },
  {
    id: "ism-manufacturing-pmi",
    section: "growth",
    label: "ISM Manufacturing PMI",
    displayKind: "index_pts",
    source: "ISM",
    sourceSeriesId: "ISM-MANUFACTURING-PMI",
    sourceUrl:
      "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/",
  },
];
