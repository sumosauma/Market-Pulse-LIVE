import { buildOfficialHistorySnapshot } from "./historySnapshot";
import type {
  ParsedGermanyBundesbankHistory,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";

export const STRUCTURALLY_MISSING_DE: readonly YieldMaturity[] = [];

export function buildGermanyBundesbankYieldSnapshot(
  history: ParsedGermanyBundesbankHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  return buildOfficialHistorySnapshot({
    countryId: "DE",
    country: "Germany",
    source: "Deutsche Bundesbank",
    series: history.series,
    failedMaturities: history.failedMaturities,
    comparisonId,
    updatedAtIso,
  });
}

export { snapshotToRowViews } from "./rowViews";
