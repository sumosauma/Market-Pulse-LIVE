import {
  buildYieldCurvePoint,
  missingSovereignPoint,
  officialSovereignPoint,
  resolveMaturitySourceType,
  unavailableSovereignPoint,
} from "./observations";
import {
  getMaturityCurveType,
  getMaturityMethodologyNote,
  getMaturityOfficialSource,
  getSovereignCountry,
} from "./sovereignCountries";
import type {
  SovereignCountryId,
  YieldCurveRowView,
  YieldCurveSnapshot,
  YieldCurveSnapshotPoint,
  YieldMaturity,
  YieldPointSourceType,
} from "./types";

function resolveMethodologyNote(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
  snapshot: YieldCurveSnapshot,
  registryNote: string,
): string {
  if (snapshot.source === "U.S. Treasury") {
    return "U.S. Treasury Daily Treasury par yield curve rate (BC constant maturity).";
  }
  if (snapshot.source === "Riksbank") {
    return "Riksbank SWEA benchmark yield (official).";
  }
  if (snapshot.source === "Millistream/DI") {
    return (
      registryNote ||
      "Swedish market government bond yield via DI/Millistream (~15 min delayed)."
    );
  }
  if (snapshot.source === "Bank of England") {
    return (
      registryNote ||
      getMaturityMethodologyNote(countryId, maturity) ||
      "Nominal gilt zero-coupon spot curve estimated from UK gilt prices"
    );
  }
  if (snapshot.source === "ChinaBond / CCDC") {
    return (
      registryNote ||
      getMaturityMethodologyNote(countryId, maturity) ||
      "MOF–China government bond yield curve based on Chinese government bond market prices"
    );
  }
  return registryNote || getMaturityMethodologyNote(countryId, maturity) || snapshot.source;
}

function pointForType(
  type: YieldPointSourceType,
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
  years: number,
  yieldPct: number | null,
  date: string,
  publisher: string,
  methodologyNote: string,
  snapshot: YieldCurveSnapshot,
): YieldCurveRowView["current"] {
  if (type === "missing") {
    return missingSovereignPoint(countryId, maturity, years, date, publisher);
  }
  if (type === "unavailable") {
    return unavailableSovereignPoint(countryId, maturity, years, date, publisher);
  }
  if (type === "external") {
    return buildYieldCurvePoint({
      countryId,
      maturity,
      years,
      yield: yieldPct,
      date,
      source: publisher,
      sourceType: "external",
      curveType: getMaturityCurveType(countryId, maturity),
      methodologyNote: resolveMethodologyNote(countryId, maturity, snapshot, methodologyNote),
    });
  }
  return officialSovereignPoint(
    countryId,
    maturity,
    years,
    yieldPct!,
    date,
    publisher,
    resolveMethodologyNote(countryId, maturity, snapshot, methodologyNote),
  );
}

function rowFromSnapshotPoint(
  countryId: SovereignCountryId,
  maturity: YieldMaturity,
  pt: YieldCurveSnapshotPoint,
  snapshot: YieldCurveSnapshot,
): YieldCurveRowView {
  const years = pt.years;
  const publisher = getMaturityOfficialSource(countryId, maturity);
  const methodologyNote = getMaturityMethodologyNote(countryId, maturity) ?? "";
  const unavailable = snapshot.unavailableMaturities;

  const currentType = resolveMaturitySourceType(
    countryId,
    maturity,
    pt.currentYield,
    snapshot.source,
    unavailable,
  );
  const comparisonType = resolveMaturitySourceType(
    countryId,
    maturity,
    pt.comparisonYield,
    snapshot.source,
    unavailable,
  );

  const current = pointForType(
    currentType,
    countryId,
    maturity,
    years,
    pt.currentYield,
    snapshot.date,
    publisher,
    methodologyNote,
    snapshot,
  );
  const comparison = pointForType(
    comparisonType,
    countryId,
    maturity,
    years,
    pt.comparisonYield,
    snapshot.comparisonDate,
    publisher,
    methodologyNote,
    snapshot,
  );

  const noData = currentType === "missing" || currentType === "unavailable";

  return {
    maturity,
    years,
    currentYield: noData ? null : pt.currentYield,
    comparisonYield:
      comparisonType === "missing" || comparisonType === "unavailable" ? null : pt.comparisonYield,
    changeBps:
      noData || comparisonType === "missing" || comparisonType === "unavailable" ? null : pt.changeBps,
    current,
    comparison,
  };
}

/** Map persisted/API snapshot → UI rows with per-maturity sovereign metadata. */
export function snapshotToRowViews(snapshot: YieldCurveSnapshot): YieldCurveRowView[] {
  const countryId = snapshot.countryId ?? "US";
  const cfg = getSovereignCountry(countryId);
  return cfg.harmonizedGrid.map((maturity) => {
    const pt = snapshot.points.find((p) => p.maturity === maturity);
    if (!pt) {
      throw new Error(`[yield-curve] snapshot missing maturity ${maturity}`);
    }
    return rowFromSnapshotPoint(countryId, maturity, pt, snapshot);
  });
}
