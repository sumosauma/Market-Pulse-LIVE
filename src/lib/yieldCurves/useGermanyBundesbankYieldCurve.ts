import type { YieldComparisonId } from "./types";
import { buildGermanyBundesbankYieldSnapshot } from "./fetchGermanyBundesbankCurve";
import { DE_HISTORY_CACHE_TTL_MS } from "./germanyHistoryCache";
import { getGermanyBundesbankYieldHistory, getGermanyTradingViewYields } from "./germanyYieldCurve.server";
import { useOfficialHistoryYieldCurve } from "./useOfficialHistoryYieldCurve";
import { useServerFn } from "@tanstack/react-start";

/** Germany: Bundesbank Svensson zero curve. TradingView replaces the whole curve only if that history is unavailable. */
export function useGermanyBundesbankYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const fetchHistory = useServerFn(getGermanyBundesbankYieldHistory);
  const fetchTv = useServerFn(getGermanyTradingViewYields);
  return useOfficialHistoryYieldCurve({
    historyQueryKey: "yield-curve-de-bundesbank-history",
    browserKey: "market-pulse:de-bundesbank-yield-history:v1",
    log: "[DE_CURVE]",
    ttlMs: DE_HISTORY_CACHE_TTL_MS,
    isDiskTag: (tag) => tag === "bundesbank-disk-cache",
    comparison,
    enabled,
    fetchHistory,
    buildSnapshot: buildGermanyBundesbankYieldSnapshot,
    tvQueryKey: "yield-curve-de-tv-fallback",
    fetchTv,
    tvFallbackHint:
      "Official Deutsche Bundesbank curve unavailable. Showing the full TradingView Germany government bond yield curve.",
    unavailableError: "Germany yield curve data unavailable.",
  });
}
