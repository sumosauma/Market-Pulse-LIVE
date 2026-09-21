/** Map monitor view modes and overlay card configs — UI only, no fetch changes. */

export type EquityMapView = "global" | "europe";

/** High-level overview cards in global map (not full country list). */
export type GlobalOverviewCard = Readonly<{
  id: string;
  indexName: string;
  countryName: string;
  /** Bind live quote only when index matches registry row exactly */
  sourceCountryId?: string;
}>;

/** @deprecated use GlobalOverviewCard */
export type GlobalEuropeOverviewCard = GlobalOverviewCard;

export const GLOBAL_EUROPE_OVERVIEW_CARDS: readonly GlobalOverviewCard[] = [
  { id: "omxn40", indexName: "OMXN40", countryName: "Nordics", sourceCountryId: "omxn40" },
  { id: "omxs30", indexName: "OMXS30", countryName: "Sweden", sourceCountryId: "SE" },
  { id: "eu500", indexName: "EU500", countryName: "Europe", sourceCountryId: "eu500" },
];

/** Lower-left global overview cards on the world map. */
export const GLOBAL_LEFT_OVERVIEW_CARDS: readonly GlobalOverviewCard[] = [
  { id: "nqgi", indexName: "Nasdaq Global", countryName: "Global", sourceCountryId: "nqgi" },
];

/** Pan-regional indexes — no single country to highlight on the map. */
export const NON_GEO_MAP_MARKET_IDS = new Set<string>(["eu500", "omxn40", "nqgi"]);

export type EuropeDetailCluster = Readonly<{
  id: string;
  label: string;
  countryIds: readonly string[];
}>;

/** Europe drilldown card clusters — tracked markets only (separate from map geography). */
export const EUROPE_DETAIL_CLUSTERS: readonly EuropeDetailCluster[] = [
  {
    id: "nordics",
    label: "Nordics",
    countryIds: ["SE", "NO", "DK", "FI"],
  },
  {
    id: "western",
    label: "Western Europe",
    countryIds: ["GB", "DE", "FR", "NL", "CH"],
  },
  {
    id: "southern",
    label: "Southern Europe",
    countryIds: ["IT", "ES"],
  },
];

export const EUROPE_DETAIL_COUNTRY_IDS: readonly string[] = EUROPE_DETAIL_CLUSTERS.flatMap(
  (c) => c.countryIds,
);

/**
 * Panoramic Europe viewport — Atlantic/Greenland west through western Russia east.
 * Used as fallback if country features fail to load.
 */
export const EUROPE_REGION_BBOX = {
  west: -32,
  east: 54,
  south: 33,
  north: 73,
} as const;

/**
 * Map background — connected Europe through western Russia (geography only, no chips).
 * ISO 3166-1 numeric (world-atlas).
 */
export const EUROPE_VIEW_RENDER_ISO_NUMERIC: readonly string[] = [
  "752", "578", "208", "246",
  "826", "276", "250", "528", "756", "380", "724",
  "372", "620", "056", "442", "040",
  "616", "203", "703", "705", "191", "348",
  "233", "428", "440",
  "804", "112", "642", "498",
  "643",
  "352", "504", "304",
];

/**
 * Zoom/framing — tracked markets + western rim (no eastern Europe in fit).
 * Russia/Greenland/eastern context still render; excluding them from fit zooms
 * market countries apart so geo-anchored chips overlap less.
 */
export const EUROPE_VIEW_FIT_ISO_NUMERIC: readonly string[] = [
  "752", "578", "208", "246",
  "826", "372", "352",
  "276", "250", "528", "756", "380", "724", "620",
  "056", "442", "040",
  "504",
];

export const EUROPE_VIEW_RENDER_ISO_SET = new Set(EUROPE_VIEW_RENDER_ISO_NUMERIC);
export const EUROPE_VIEW_FIT_ISO_SET = new Set(EUROPE_VIEW_FIT_ISO_NUMERIC);

/** @deprecated use EUROPE_VIEW_RENDER_ISO_SET */
export const EUROPE_MAP_FRAME_ISO_NUMERIC = EUROPE_VIEW_RENDER_ISO_NUMERIC;
/** @deprecated use EUROPE_VIEW_RENDER_ISO_SET */
export const EUROPE_MAP_FRAME_ISO_SET = EUROPE_VIEW_RENDER_ISO_SET;

export const EUROPE_MARKET_COUNTRY_IDS = new Set(EUROPE_DETAIL_COUNTRY_IDS);

/** Global map — markets pinned to country geography (not overlay columns). */
export const GLOBAL_GEO_ANCHORED_COUNTRY_IDS: readonly string[] = ["AU", "ZA"];
