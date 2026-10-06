import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { YieldComparisonId, YieldCurveRowView, YieldCurveSnapshot } from "./types";
import { snapshotToRowViews } from "./rowViews";
import {
  buildEuropeTradingViewYieldSnapshot,
  type EuropeTradingViewCurrent,
} from "./europeTradingViewCurve";

const TV_STALE_MS = 5 * 60 * 1000;

type HistoryBody<H> = {
  history: H | null;
  errorMessage: string | null;
  dataSourceTag: string;
  updatedAtISO: string;
  cacheSavedAtISO: string | null;
};

type HistoryWithSeries = { series?: readonly unknown[]; fetchedAt?: string };

export type OfficialHistoryCurveResult = {
  snapshot: YieldCurveSnapshot;
  rows: YieldCurveRowView[];
  dataSourceTag: string;
  serverErrorMessage: string | null;
  fallbackHint: string | null;
  cacheSavedAtISO: string | null;
  historyFetchedAt: string | null;
};

function hasSeries(history: unknown): history is HistoryWithSeries {
  return Boolean(
    history &&
      typeof history === "object" &&
      Array.isArray((history as HistoryWithSeries).series) &&
      (history as HistoryWithSeries).series!.length > 0,
  );
}

function persistBrowserHistory(key: string, history: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), history }));
  } catch {
    // ignore quota
  }
}

function loadBrowserHistory(key: string): { savedAt: number; history: HistoryWithSeries } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; history?: unknown };
    if (!hasSeries(parsed.history)) return null;
    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      history: parsed.history,
    };
  } catch {
    return null;
  }
}

/**
 * Official history is loaded once per TTL. Comparison periods are derived locally.
 * TradingView runs only when that official history cannot be built, and then replaces the whole curve.
 */
export function useOfficialHistoryYieldCurve<H extends HistoryWithSeries>(opts: {
  historyQueryKey: string;
  browserKey: string;
  log: string;
  ttlMs: number;
  isDiskTag: (tag: string) => boolean;
  comparison: YieldComparisonId;
  enabled: boolean;
  fetchHistory: (input: { data: { forceRefresh?: boolean } }) => Promise<HistoryBody<H>>;
  buildSnapshot: (history: H, comparison: YieldComparisonId, updatedAt: string) => YieldCurveSnapshot | null;
  tvQueryKey: string;
  fetchTv: () => Promise<{ current: EuropeTradingViewCurrent | null; errorMessage: string | null }>;
  tvFallbackHint: string;
  unavailableError: string;
}) {
  const historyQuery = useQuery({
    queryKey: [opts.historyQueryKey],
    queryFn: async (): Promise<HistoryBody<H> | null> => {
      try {
        const payload = await opts.fetchHistory({ data: { forceRefresh: false } });
        if (hasSeries(payload.history)) {
          persistBrowserHistory(opts.browserKey, payload.history);
          return payload;
        }
      } catch (e) {
        console.info(`${opts.log} Server history fetch failed — ${e instanceof Error ? e.message : String(e)}`);
      }
      const browser = loadBrowserHistory(opts.browserKey);
      if (browser) {
        return {
          history: browser.history as H,
          dataSourceTag: "browser-local-storage",
          errorMessage: null,
          updatedAtISO: new Date(browser.savedAt).toISOString(),
          cacheSavedAtISO: new Date(browser.savedAt).toISOString(),
        };
      }
      return {
        history: null,
        dataSourceTag: "unavailable",
        errorMessage: opts.unavailableError,
        updatedAtISO: new Date().toISOString(),
        cacheSavedAtISO: null,
      };
    },
    enabled: opts.enabled,
    staleTime: opts.ttlMs,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: () => {
      const browser = loadBrowserHistory(opts.browserKey);
      if (!browser) return undefined;
      return {
        history: browser.history as H,
        dataSourceTag: "browser-local-storage",
        errorMessage: null,
        updatedAtISO: new Date(browser.savedAt).toISOString(),
        cacheSavedAtISO: new Date(browser.savedAt).toISOString(),
      } satisfies HistoryBody<H>;
    },
    initialDataUpdatedAt: () => loadBrowserHistory(opts.browserKey)?.savedAt,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => {
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return Date.now() - updatedAt >= opts.ttlMs;
    },
  });

  const officialHistory = hasSeries(historyQuery.data?.history) ? (historyQuery.data!.history as H) : null;
  const officialSnapshot = useMemo(() => {
    if (!officialHistory || !historyQuery.data) return null;
    return opts.buildSnapshot(officialHistory, opts.comparison, historyQuery.data.updatedAtISO);
  }, [officialHistory, historyQuery.data, opts]);

  const officialSettled = !opts.enabled || historyQuery.isFetched || Boolean(officialSnapshot);
  const officialFailed = opts.enabled && historyQuery.isFetched && !officialSnapshot;

  const tvQuery = useQuery({
    queryKey: [opts.tvQueryKey],
    queryFn: () => opts.fetchTv(),
    enabled: officialFailed,
    staleTime: TV_STALE_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const data = useMemo((): OfficialHistoryCurveResult | null => {
    if (officialSnapshot && historyQuery.data) {
      const tag = historyQuery.data.dataSourceTag;
      const isBrowser = tag === "browser-local-storage";
      const isDisk = opts.isDiskTag(tag);
      return {
        snapshot: officialSnapshot,
        rows: snapshotToRowViews(officialSnapshot),
        dataSourceTag: tag,
        serverErrorMessage: historyQuery.data.errorMessage,
        fallbackHint: isBrowser
          ? `Using cached official data (${new Date(historyQuery.data.cacheSavedAtISO ?? historyQuery.data.updatedAtISO).toLocaleString()})`
          : isDisk
            ? "Using cached official data (server disk)"
            : null,
        cacheSavedAtISO: historyQuery.data.cacheSavedAtISO,
        historyFetchedAt: officialHistory?.fetchedAt ?? null,
      };
    }

    const tv = tvQuery.data?.current ?? null;
    if (officialFailed && tv?.quotes.length) {
      const snapshot = buildEuropeTradingViewYieldSnapshot(tv, opts.comparison, new Date().toISOString());
      if (!snapshot) return null;
      return {
        snapshot,
        rows: snapshotToRowViews(snapshot),
        dataSourceTag: "tv-fallback",
        serverErrorMessage: historyQuery.data?.errorMessage ?? tvQuery.data?.errorMessage ?? null,
        fallbackHint: opts.tvFallbackHint,
        cacheSavedAtISO: null,
        historyFetchedAt: null,
      };
    }
    return null;
  }, [officialSnapshot, officialHistory, officialFailed, historyQuery.data, tvQuery.data, opts]);

  const tvActive = officialFailed;
  const settled = officialSettled && (!tvActive || tvQuery.isFetched);
  const bothFailed = opts.enabled && settled && !data;

  return {
    ...historyQuery,
    data,
    isPending: opts.enabled && !data && !settled,
    isError: bothFailed,
    error: bothFailed ? new Error(opts.unavailableError) : null,
    isFetching: historyQuery.isFetching || (tvActive && (tvQuery.isFetching || !tvQuery.isFetched)),
    isUpdating: Boolean(data) && (historyQuery.isFetching || tvQuery.isFetching),
  };
}
