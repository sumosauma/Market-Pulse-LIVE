import type {
  SovereignCountryId,
  YieldCurveKind,
  YieldCurvePoint,
  YieldMaturity,
  YieldPointSourceType,
} from "./types";
import {
  getMaturityCoverage,
  getMaturityCurveType,
  getMaturityOfficialSource,
  getSovereignCountry,
} from "./sovereignCountries";

type BuildPointInput = Readonly<{
  countryId: SovereignCountryId;
  maturity: string;
  years: number;
  yield: number | null;
  date: string;
  source: string;
  sourceType: YieldPointSourceType;
  curveType?: YieldCurveKind;
  methodologyNote?: string;
  basedOn?: readonly string[];
}>;

export function buildYieldCurvePoint(input: BuildPointInput): YieldCurvePoint {
  const cfg = getSovereignCountry(input.countryId);
  return {
    country: input.countryId,
    maturity: input.maturity,
    years: input.years,
    yield: input.yield,
    date: input.date,
    source: input.source,
    sourceType: input.sourceType,
    curveType: input.curveType ?? cfg.defaultCurveType,
    methodologyNote: input.methodologyNote ?? cfg.methodologyNote,
    basedOn: input.basedOn,
  };
}

export function officialSovereignPoint(
  countryId: SovereignCountryId,
  maturity: string,
  years: number,
  yieldPct: number,
  date: string,
  source: string,
  methodologyNote?: string,
): YieldCurvePoint {
  return buildYieldCurvePoint({
    countryId,
    maturity,
    years,
    yield: yieldPct,
    date,
    source,
    sourceType: "official",
    curveType: getMaturityCurveType(countryId, maturity as YieldMaturity),
    methodologyNote,
  });
}

export function missingSovereignPoint(
  countryId: SovereignCountryId,
  maturity: string,
  years: number,
  date: string,
  source: string,
): YieldCurvePoint {
  return buildYieldCurvePoint({
    countryId,
    maturity,
    years,
    yield: null,
    date,
    source,
    sourceType: "missing",
    methodologyNote: "Not published on the official harmonized grid.",
  });
}

export function unavailableSovereignPoint(
  countryId: SovereignCountryId,
  maturity: string,
  years: number,
  date: string,
  source: string,
): YieldCurvePoint {
  return buildYieldCurvePoint({
    countryId,
    maturity,
    years,
    yield: null,
    date,
    source,
    sourceType: "unavailable",
    methodologyNote: "Official series temporarily unavailable from the publisher.",
  });
}

export function resolveSourceTypeForYield(
  yieldPct: number | null,
  whenPresent: YieldPointSourceType = "official",
): YieldPointSourceType {
  if (yieldPct === null || !Number.isFinite(yieldPct)) return "missing";
  return whenPresent;
}

/** Map a snapshot leg to UI source type using official-only coverage metadata. */
export function resolveMaturitySourceType(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
  yieldPct: number | null,
  snapshotSource: string,
  unavailableMaturities?: readonly YieldMaturity[],
): YieldPointSourceType {
  if (getMaturityCoverage(countryId, maturity) === "missing") return "missing";
  if (unavailableMaturities?.includes(maturity)) return "unavailable";
  if (snapshotSource === "Mock (illustrative)") {
    return resolveSourceTypeForYield(yieldPct, "external");
  }
  if (getMaturityOfficialSource(countryId, maturity) === "Riksbank") {
    return resolveSourceTypeForYield(yieldPct, "official");
  }
  if (snapshotSource === "Millistream/DI") {
    return resolveSourceTypeForYield(yieldPct, "external");
  }
  return resolveSourceTypeForYield(yieldPct, "official");
}
