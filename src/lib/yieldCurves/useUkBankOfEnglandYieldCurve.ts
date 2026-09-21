import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { YieldComparisonId, YieldCurveRowView, YieldCurveSnapshot } from "./types";
import type { UkYieldDataSourceTag } from "./types";
import {
  buildUkBankOfEnglandYieldSnapshot,
  snapshotToRowViews,
} from "./fetchUkBankOfEnglandCurve";
import { getUkBankOfEnglandYieldHistory, getUkTradingViewYields } from "./ukYieldCurve.server";
import { UK_HISTORY_CACHE_TTL_MS } from "./ukHistoryCache";
import { buildUkTradingViewYieldSnapshot } from "./ukTradingViewCurve";

const TV_STALE_MS = 5 * 60 * 1000;

export type UkBankOfEnglandYieldCurveResult = {
  snapshot: YieldCurveSnapshot;
  rows: YieldCurveRowView[];
  dataSourceTag: UkYieldDataSourceTag;
  serverErrorMessage: string | null;
  fallbackHint: string | null;
  cacheSavedAtISO: string | null;
  historyFetchedAt: string | null;
};

/** UK curve: TradingView current and comparisons use the same symbols. Bank of England is only the full-curve fallback. */
export function useUkBankOfEnglandYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const fetchTradingView = useServerFn(getUkTradingViewYields);
  const fetchHistory = useServerFn(getUkBankOfEnglandYieldHistory);

  const tvQuery = useQuery({
    queryKey: ["yield-curve-gb-tv-v2"],
    queryFn: () => fetchTradingView(),
    enabled,
    staleTime: TV_STALE_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const tvOk = Boolean(tvQuery.data?.current?.quotes.length);
  const tvFailed = tvQuery.isFetched && !tvOk;

  const historyQuery = useQuery({
    queryKey: ["yield-curve-gb-boe-history"],
    queryFn: () => fetchHistory({ data: { forceRefresh: false } }),
    enabled: enabled && tvFailed,
    staleTime: UK_HISTORY_CACHE_TTL_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => {
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return Date.now() - updatedAt >= UK_HISTORY_CACHE_TTL_MS;
    },
  });

  const data = useMemo((): UkBankOfEnglandYieldCurveResult | null => {
    const updatedAt = new Date().toISOString();
    const tv = tvQuery.data?.current ?? null;
    const history = historyQuery.data?.history?.series?.length ? historyQuery.data.history : null;

    if (tv?.quotes.length) {
      const snapshot = buildUkTradingViewYieldSnapshot(tv, comparison, updatedAt);
      if (!snapshot) return null;
      return {
        snapshot,
        rows: snapshotToRowViews(snapshot),
        dataSourceTag: "tv-live",
        serverErrorMessage: null,
        fallbackHint: null,
        cacheSavedAtISO: null,
        historyFetchedAt: null,
      };
    }

    if (tvQuery.isFetched && history) {
      const snapshot = buildUkBankOfEnglandYieldSnapshot(
        history,
        comparison,
        historyQuery.data?.updatedAtISO ?? updatedAt,
      );
      if (!snapshot) return null;
      return {
        snapshot,
        rows: snapshotToRowViews(snapshot),
        dataSourceTag: "boe-fallback",
        serverErrorMessage: tvQuery.data?.errorMessage ?? "TradingView UK government bond yields unavailable.",
        fallbackHint:
          "TradingView UK government bond yields unavailable. Showing the latest Bank of England gilt spot curve.",
        cacheSavedAtISO: historyQuery.data?.cacheSavedAtISO ?? null,
        historyFetchedAt: history.fetchedAt,
      };
    }

    return null;
  }, [comparison, historyQuery.data, historyQuery.isFetched, tvQuery.data, tvQuery.isFetched]);

  const boeSettled = !tvFailed || historyQuery.isFetched;
  const settled = tvQuery.isFetched && boeSettled;
  const bothFailed = settled && !data;

  return {
    ...tvQuery,
    data,
    isPending: !data && !settled,
    isError: bothFailed,
    error: bothFailed ? new Error("United Kingdom yield curve data unavailable.") : null,
    isFetching: tvQuery.isFetching || historyQuery.isFetching,
    isUpdating: Boolean(data) && (tvQuery.isFetching || historyQuery.isFetching),
  };
}
