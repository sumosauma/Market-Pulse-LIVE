import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type {
  GetSwedenYieldHistoryResponse,
  ParsedSwedenRiksbankHistory,
  YieldComparisonId,
  YieldCurveRowView,
  YieldCurveSnapshot,
} from "./types";
import { buildSwedenDiYieldSnapshot, snapshotToRowViews } from "./fetchSwedenDiCurve";
import { getSwedenYieldHistory } from "./swedenYieldCurve.server";
import { isSwedenHistoryCacheFresh, SE_HISTORY_CACHE_TTL_MS } from "./swedenHistoryCache";

const LOG = "[SE_CURVE]";
const BROWSER_LS_KEY = "market-pulse:se-yield-history:v2";

export type SwedenDiYieldCurveResult = {
  snapshot: YieldCurveSnapshot;
  rows: YieldCurveRowView[];
  dataSourceTag: GetSwedenYieldHistoryResponse["dataSourceTag"];
  serverErrorMessage: string | null;
  fallbackHint: string | null;
  cacheSavedAtISO: string | null;
  historyFetchedAt: string | null;
};

/** @deprecated Use SwedenDiYieldCurveResult */
export type SwedenRiksbankYieldCurveResult = SwedenDiYieldCurveResult;

function persistBrowserHistory(history: ParsedSwedenRiksbankHistory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BROWSER_LS_KEY,
      JSON.stringify({ savedAt: Date.now(), history }),
    );
  } catch {
    // ignore quota / private mode
  }
}

function loadBrowserHistory(): { savedAt: number; history: ParsedSwedenRiksbankHistory } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROWSER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { savedAt?: unknown; history?: ParsedSwedenRiksbankHistory };
    if (!obj.history?.series?.length) return null;
    const savedAt = typeof obj.savedAt === "number" ? obj.savedAt : Date.now();
    return { savedAt, history: obj.history };
  } catch {
    return null;
  }
}

function browserCacheToHistoryModel(
  br: { savedAt: number; history: ParsedSwedenRiksbankHistory },
): GetSwedenYieldHistoryResponse {
  return {
    history: br.history,
    dataSourceTag: "browser-local-storage",
    errorMessage: null,
    updatedAtISO: new Date(br.savedAt).toISOString(),
    cacheSavedAtISO: new Date(br.savedAt).toISOString(),
  };
}

function buildCurveResult(
  historyModel: GetSwedenYieldHistoryResponse,
  comparison: YieldComparisonId,
): SwedenDiYieldCurveResult | null {
  const history = historyModel.history;
  if (!history?.series?.length) return null;

  const snapshot = buildSwedenDiYieldSnapshot(history, comparison, historyModel.updatedAtISO);
  if (!snapshot) return null;

  const tag = historyModel.dataSourceTag;
  const isBrowser = tag === "browser-local-storage";
  const isDisk = tag === "di-disk-cache";

  return {
    snapshot,
    rows: snapshotToRowViews(snapshot),
    dataSourceTag: tag,
    serverErrorMessage: historyModel.errorMessage,
    fallbackHint: isBrowser
      ? `Using cached DI data (${new Date(historyModel.cacheSavedAtISO ?? historyModel.updatedAtISO).toLocaleString()})`
      : isDisk
        ? "Using cached DI data (server disk)"
        : null,
    cacheSavedAtISO: historyModel.cacheSavedAtISO,
    historyFetchedAt: history.fetchedAt,
  };
}

async function fetchSwedenHistoryModel(
  serverFn: (input: { data: { forceRefresh?: boolean } }) => Promise<GetSwedenYieldHistoryResponse>,
  forceRefresh = false,
): Promise<GetSwedenYieldHistoryResponse | null> {
  try {
    const payload = await serverFn({ data: { forceRefresh } });
    if (payload.history?.series?.length) {
      persistBrowserHistory(payload.history);
      return payload;
    }
    return payload.history ? payload : null;
  } catch (e) {
    console.info(`${LOG} Server history fetch failed — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function initialHistoryFromBrowser(): GetSwedenYieldHistoryResponse | undefined {
  const br = loadBrowserHistory();
  if (!br) return undefined;
  return browserCacheToHistoryModel(br);
}

/** Yield Curves (Sweden) — DI history fetched once per TTL; comparisons rebuilt locally. */
export function useSwedenDiYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const serverFn = useServerFn(getSwedenYieldHistory);

  const historyQuery = useQuery({
    queryKey: ["yield-curve-se-history", "v2"],
    queryFn: async () => {
      const live = await fetchSwedenHistoryModel(serverFn, false);
      if (live?.history?.series?.length) return live;

      const br = loadBrowserHistory();
      if (br?.history?.series?.length) {
        console.info(`${LOG} Loaded from browser localStorage after server miss`);
        return browserCacheToHistoryModel(br);
      }
      return live;
    },
    enabled,
    staleTime: SE_HISTORY_CACHE_TTL_MS,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: initialHistoryFromBrowser,
    initialDataUpdatedAt: () => loadBrowserHistory()?.savedAt,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => {
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return !isSwedenHistoryCacheFresh(updatedAt);
    },
  });

  const data = useMemo(() => {
    if (!historyQuery.data?.history?.series?.length) return null;
    return buildCurveResult(historyQuery.data, comparison);
  }, [historyQuery.data, comparison]);

  const isUpdating = historyQuery.isFetching && Boolean(historyQuery.data?.history?.series?.length);

  return {
    ...historyQuery,
    data,
    isPending: historyQuery.isPending && !data,
    isUpdating,
  };
}

/** @deprecated Use useSwedenDiYieldCurve */
export const useSwedenRiksbankYieldCurve = useSwedenDiYieldCurve;

/** Imperative refresh — bypasses server disk TTL and refetches DI. */
export function useSwedenDiRefresh() {
  const serverFn = useServerFn(getSwedenYieldHistory);
  return () => fetchSwedenHistoryModel(serverFn, true);
}

/** @deprecated Use useSwedenDiRefresh */
export const useSwedenRiksbankRefresh = useSwedenDiRefresh;
