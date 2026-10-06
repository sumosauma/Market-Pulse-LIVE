import { buildOfficialHistorySnapshot } from "./historySnapshot";
import type { ParsedFranceTecHistory, YieldComparisonId, YieldCurveSnapshot, YieldMaturity } from "./types";

/** Official TEC history begins at 1Y. These stay unpublished on the official curve. */
export const STRUCTURALLY_MISSING_FR: readonly YieldMaturity[] = ["1M", "3M", "6M"];

export function buildFranceTecYieldSnapshot(
  history: ParsedFranceTecHistory,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  return buildOfficialHistorySnapshot({
    countryId: "FR",
    country: "France",
    source: "Banque de France",
    series: history.series,
    failedMaturities: history.failedMaturities,
    comparisonId,
    updatedAtIso,
  });
}

export { snapshotToRowViews } from "./rowViews";
