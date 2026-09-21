import {
  YIELD_CURVE_MATURITIES,
  type MaturityCoverageStatus,
  type SovereignCountryId,
  type YieldComparisonId,
  type YieldCurveKind,
  type YieldMaturity,
} from "./types";

/** Harmonized sovereign yield grid — same maturities for every country. */
export const HARMONIZED_YIELD_GRID = YIELD_CURVE_MATURITIES;

/** Registry of sovereign yield-curve countries (extend when adding live fetchers). */
export type SovereignCountryConfig = Readonly<{
  id: SovereignCountryId;
  label: string;
  /** Flag emoji for summary cards. */
  flag: string;
  /** Harmonized display grid — identical across countries. */
  harmonizedGrid: typeof YIELD_CURVE_MATURITIES;
  /** Official-only coverage plan per maturity (no external completion). */
  maturityCoverage: Record<YieldMaturity, MaturityCoverageStatus>;
  /** When an official leg uses a different publisher than `defaultSource`. */
  maturityOfficialSources?: Partial<Record<YieldMaturity, string>>;
  /** Per-maturity methodology notes (e.g. zero-coupon vs generic). */
  maturityMethodologyNotes?: Partial<Record<YieldMaturity, string>>;
  /** Per-maturity curve kind when it differs from defaultCurveType. */
  maturityCurveTypes?: Partial<Record<YieldMaturity, YieldCurveKind>>;
  /** True when a live fetcher is wired in the Yield Curves module. */
  isLive: boolean;
  defaultCurveType: "par" | "zeroCoupon" | "benchmark";
  /** Default official publisher label for observed points. */
  defaultSource: string;
  methodologyNote: string;
}>;

function fullCoverage(
  map: Record<YieldMaturity, MaturityCoverageStatus>,
): Record<YieldMaturity, MaturityCoverageStatus> {
  return map;
}

const ALL_OFFICIAL = fullCoverage({
  "1M": "official",
  "3M": "official",
  "6M": "official",
  "1Y": "official",
  "2Y": "official",
  "5Y": "official",
  "10Y": "official",
  "30Y": "official",
});

export const SOVEREIGN_COUNTRY_US: SovereignCountryConfig = {
  id: "US",
  label: "United States",
  flag: "🇺🇸",
  harmonizedGrid: HARMONIZED_YIELD_GRID,
  maturityCoverage: ALL_OFFICIAL,
  isLive: true,
  defaultCurveType: "par",
  defaultSource: "U.S. Treasury",
  methodologyNote:
    "Daily Treasury par yield curve rates (constant maturity); sovereign issues only.",
};

export const SOVEREIGN_COUNTRY_SE: SovereignCountryConfig = {
  id: "SE",
  label: "Sweden",
  flag: "🇸🇪",
  harmonizedGrid: HARMONIZED_YIELD_GRID,
  maturityCoverage: fullCoverage({
    "1M": "official",
    "3M": "official",
    "6M": "official",
    "1Y": "missing",
    "2Y": "official",
    "5Y": "official",
    "10Y": "official",
    "30Y": "official",
  }),
  maturityOfficialSources: {
    "1M": "Riksbank",
    "3M": "Riksbank",
    "6M": "Riksbank",
  },
  maturityMethodologyNotes: {
    "1M": "Riksbank SWEA treasury bill benchmark (SETB1MBENCHC; Refinitiv/Nasdaq, T+1).",
    "3M": "Riksbank SWEA treasury bill benchmark (SETB3MBENCH; Refinitiv/Nasdaq, T+1).",
    "6M": "Riksbank SWEA treasury bill benchmark (SETB6MBENCH; Refinitiv/Nasdaq, T+1).",
    "2Y": "Swedish government bond yield via DI/Millistream (~15 min delayed).",
    "5Y": "Swedish government bond yield via DI/Millistream (~15 min delayed).",
    "10Y": "Swedish government bond yield via DI/Millistream (~15 min delayed).",
    "30Y": "Swedish government bond yield via DI/Millistream (~15 min delayed).",
  },
  isLive: true,
  defaultCurveType: "benchmark",
  defaultSource: "Millistream/DI",
  methodologyNote:
    "Front-end bills from Riksbank SWEA (official T+1); 2Y/5Y/10Y/30Y from DI/Millistream (~15 min delayed). 1Y is not published.",
};

export const SOVEREIGN_COUNTRY_NO: SovereignCountryConfig = {
  id: "NO",
  label: "Norway",
  flag: "🇳🇴",
  harmonizedGrid: HARMONIZED_YIELD_GRID,
  maturityCoverage: fullCoverage({
    "1M": "missing",
    "3M": "official",
    "6M": "official",
    "1Y": "official",
    "2Y": "official",
    "5Y": "official",
    "10Y": "official",
    "30Y": "missing",
  }),
  maturityCurveTypes: {
    "2Y": "zeroCoupon",
  },
  maturityMethodologyNotes: {
    "3M": "Generic yield: effective yield on nearest Norwegian government security",
    "6M": "Generic yield: effective yield on nearest Norwegian government security",
    "1Y": "Generic yield: effective yield on nearest Norwegian government security (12M bill)",
    "2Y": "GOVT_ZEROCOUPON: NSS fitted zero-coupon yield",
    "5Y": "Generic yield: effective yield on nearest Norwegian government security",
    "10Y": "Generic yield: effective yield on nearest Norwegian government security",
  },
  isLive: true,
  defaultCurveType: "benchmark",
  defaultSource: "Norges Bank",
  methodologyNote:
    "Generic yield: effective yield on nearest Norwegian government security",
};

export const SOVEREIGN_COUNTRY_CN: SovereignCountryConfig = {
  id: "CN",
  label: "China",
  flag: "🇨🇳",
  harmonizedGrid: HARMONIZED_YIELD_GRID,
  maturityCoverage: fullCoverage({
    "1M": "missing",
    "3M": "official",
    "6M": "official",
    "1Y": "official",
    "2Y": "official",
    "5Y": "official",
    "10Y": "official",
    "30Y": "official",
  }),
  isLive: true,
  defaultCurveType: "benchmark",
  defaultSource: "ChinaBond / CCDC",
  methodologyNote:
    "MOF–China government bond yield curve based on Chinese government bond market prices",
};

export const SOVEREIGN_COUNTRY_GB: SovereignCountryConfig = {
  id: "GB",
  label: "United Kingdom",
  flag: "🇬🇧",
  harmonizedGrid: HARMONIZED_YIELD_GRID,
  maturityCoverage: fullCoverage({
    "1M": "official",
    "3M": "official",
    "6M": "official",
    "1Y": "official",
    "2Y": "official",
    "5Y": "official",
    "10Y": "official",
    "30Y": "official",
  }),
  isLive: true,
  defaultCurveType: "zeroCoupon",
  defaultSource: "Bank of England",
  methodologyNote: "Nominal gilt zero-coupon spot curve estimated from UK gilt prices",
};

export const SOVEREIGN_COUNTRIES: Record<SovereignCountryId, SovereignCountryConfig> = {
  US: SOVEREIGN_COUNTRY_US,
  SE: SOVEREIGN_COUNTRY_SE,
  NO: SOVEREIGN_COUNTRY_NO,
  CN: SOVEREIGN_COUNTRY_CN,
  GB: SOVEREIGN_COUNTRY_GB,
};

/** Countries with a wired live fetcher — shown in the country selector. */
export const LIVE_SOVEREIGN_COUNTRY_OPTIONS = Object.values(SOVEREIGN_COUNTRIES)
  .filter((c) => c.isLive)
  .map((c) => ({ id: c.id, label: c.label }));

/** @deprecated Use LIVE_SOVEREIGN_COUNTRY_OPTIONS — only live countries belong in the selector. */
export const SOVEREIGN_COUNTRY_OPTIONS = LIVE_SOVEREIGN_COUNTRY_OPTIONS;

export const YIELD_COMPARISON_OPTIONS: { id: YieldComparisonId; label: string }[] = [
  { id: "Today", label: "Today" },
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "1Y", label: "1Y" },
];

export function getSovereignCountry(id: SovereignCountryId): SovereignCountryConfig {
  return SOVEREIGN_COUNTRIES[id];
}

/** Flag emoji from the sovereign country registry. */
export function sovereignCountryFlag(id: SovereignCountryId): string {
  return getSovereignCountry(id).flag;
}

export function getMaturityCoverage(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
): MaturityCoverageStatus {
  return getSovereignCountry(countryId).maturityCoverage[maturity];
}

export function getMaturityOfficialSource(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
): string {
  const cfg = getSovereignCountry(countryId);
  return cfg.maturityOfficialSources?.[maturity] ?? cfg.defaultSource;
}

export function getMaturityMethodologyNote(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
): string | undefined {
  const cfg = getSovereignCountry(countryId);
  return cfg.maturityMethodologyNotes?.[maturity] ?? cfg.methodologyNote;
}

export function getMaturityCurveType(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
): YieldCurveKind {
  const cfg = getSovereignCountry(countryId);
  return cfg.maturityCurveTypes?.[maturity] ?? cfg.defaultCurveType;
}

export function countOfficialMaturities(countryId: SovereignCountryId): number {
  return HARMONIZED_YIELD_GRID.filter((m) => getMaturityCoverage(countryId, m) === "official").length;
}
