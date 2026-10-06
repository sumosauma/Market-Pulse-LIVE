import { useServerFn } from "@tanstack/react-start";
import type { YieldComparisonId } from "./types";
import { buildFranceTecYieldSnapshot } from "./fetchFranceTecCurve";
import { FR_HISTORY_CACHE_TTL_MS } from "./franceHistoryCache";
import { getFranceTecYieldHistory, getFranceTradingViewYields } from "./franceYieldCurve.server";
import { useOfficialHistoryYieldCurve } from "./useOfficialHistoryYieldCurve";

/** France: Banque de France TEC yields. TradingView replaces the whole curve only if that history is unavailable. */
export function useFranceTecYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const fetchHistory = useServerFn(getFranceTecYieldHistory);
  const fetchTv = useServerFn(getFranceTradingViewYields);
  return useOfficialHistoryYieldCurve({
    historyQueryKey: "yield-curve-fr-tec-history",
    browserKey: "market-pulse:fr-tec-yield-history:v1",
    log: "[FR_CURVE]",
    ttlMs: FR_HISTORY_CACHE_TTL_MS,
    isDiskTag: (tag) => tag === "bdf-disk-cache",
    comparison,
    enabled,
    fetchHistory,
    buildSnapshot: buildFranceTecYieldSnapshot,
    tvQueryKey: "yield-curve-fr-tv-fallback",
    fetchTv,
    tvFallbackHint:
      "Official Banque de France TEC history unavailable. Showing the full TradingView France government bond yield curve.",
    unavailableError: "France yield curve data unavailable.",
  });
}
