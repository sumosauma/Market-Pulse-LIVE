import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type {
  GetUkYieldHistoryResponse,
  ParsedUkBankOfEnglandHistory,
  YieldComparisonId,
  YieldCurveRowView,
  YieldCurveSnapshot,
} from "./types";
import {
  buildUkBankOfEnglandYieldSnapshot,
  snapshotToRowViews,
} from "./fetchUkBankOfEnglandCurve";
import { getUkBankOfEnglandYieldHistory } from "./ukYieldCurve.server";
import { isUkHistoryCacheFresh, UK_HISTORY_CACHE_TTL_MS } from "./ukHistoryCache";

const LOG = "[GB_CURVE]";
const BROWSER_LS_KEY = "market-pulse:gb-boe-yield-history:v1";

export type UkHistoryModel = GetUkYieldHistoryResponse;

export type UkBankOfEnglandYieldCurveResult = {
  snapshot: YieldCurveSnapshot;
  rows: YieldCurveRowView[];
  dataSourceTag: GetUkYieldHistoryResponse["dataSourceTag"];
  serverErrorMessage: string | null;
  fallbackHint: string | null;
  cacheSavedAtISO: string | null;
  historyFetchedAt: string | null;
};

function persistBrowserHistory(history: ParsedUkBankOfEnglandHistory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BROWSER_LS_KEY,
      JSON.stringify({ savedAt: Date.now(), history }),
    );
  } catch {
    // ignore
  }
}

function loadBrowserHistory(): { savedAt: number; history: ParsedUkBankOfEnglandHistory } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROWSER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { savedAt?: unknown; history?: ParsedUkBankOfEnglandHistory };
    if (!obj.history?.series?.length) return null;
    const savedAt = typeof obj.savedAt === "number" ? obj.savedAt : Date.now();
    return { savedAt, history: obj.history };
  } catch {
    return null;
  }
}

function browserCacheToHistoryModel(
  br: { savedAt: number; history: ParsedUkBankOfEnglandHistory },
): UkHistoryModel {
  return {
    history: br.history,
    dataSourceTag: "browser-local-storage",
    errorMessage: null,
    updatedAtISO: new Date(br.savedAt).toISOString(),
    cacheSavedAtISO: new Date(br.savedAt).toISOString(),
  };
}

function buildCurveResult(
  historyModel: UkHistoryModel,
  comparison: YieldComparisonId,
): UkBankOfEnglandYieldCurveResult | null {
  const history = historyModel.history;
  if (!history?.series?.length) return null;

  const snapshot = buildUkBankOfEnglandYieldSnapshot(
    history,
    comparison,
    historyModel.updatedAtISO,
  );
  if (!snapshot) return null;

  const tag = historyModel.dataSourceTag;
  const isBrowser = tag === "browser-local-storage";
  const isDisk = tag === "boe-disk-cache";

  return {
    snapshot,
    rows: snapshotToRowViews(snapshot),
    dataSourceTag: tag,
    serverErrorMessage: historyModel.errorMessage,
    fallbackHint: isBrowser
      ? `Using cached Bank of England data (${new Date(historyModel.cacheSavedAtISO ?? historyModel.updatedAtISO).toLocaleString()})`
      : isDisk
        ? "Using cached Bank of England data (server disk)"
        : null,
    cacheSavedAtISO: historyModel.cacheSavedAtISO,
    historyFetchedAt: history.fetchedAt,
  };
}

async function fetchUkHistoryModel(
  serverFn: (input: { data: { forceRefresh?: boolean } }) => Promise<GetUkYieldHistoryResponse>,
  forceRefresh = false,
): Promise<UkHistoryModel | null> {
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

function initialHistoryFromBrowser(): UkHistoryModel | undefined {
  const br = loadBrowserHistory();
  if (!br) return undefined;
  return browserCacheToHistoryModel(br);
}

/** Yield Curves (UK) — history fetched once per TTL; comparisons rebuilt locally. */
export function useUkBankOfEnglandYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const serverFn = useServerFn(getUkBankOfEnglandYieldHistory);

  const historyQuery = useQuery({
    queryKey: ["yield-curve-gb-boe-history"],
    queryFn: async () => {
      const live = await fetchUkHistoryModel(serverFn, false);
      if (live?.history?.series?.length) return live;

      const br = loadBrowserHistory();
      if (br?.history?.series?.length) {
        console.info(`${LOG} Loaded from browser localStorage after server miss`);
        return browserCacheToHistoryModel(br);
      }
      return live;
    },
    enabled,
    staleTime: UK_HISTORY_CACHE_TTL_MS,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: initialHistoryFromBrowser,
    initialDataUpdatedAt: () => loadBrowserHistory()?.savedAt,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => {
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return !isUkHistoryCacheFresh(updatedAt);
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
