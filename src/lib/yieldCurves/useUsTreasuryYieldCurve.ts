import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type {
  GetUSTYieldCurveResponse,
  YieldComparisonId,
  YieldCurveRowView,
  YieldCurveSnapshot,
} from "./types";
import { buildMockYieldCurveSnapshot } from "./mockYieldCurveData";
import {
  buildTreasuryYieldSnapshot,
  dedupeUSTRowsAscending,
  snapshotToRowViews,
} from "./fetchUSTreasuryCurve";
import { getUSTreasuryYieldCurve } from "./ustYieldCurve.server";

export type USTYieldCurveDataSourceTag = GetUSTYieldCurveResponse["dataSourceTag"];

const LOG = "[UST_CURVE]";
const BROWSER_LS_KEY = "market-pulse:ust-yield-rows:v1";

export type UsTreasuryYieldCurveResult = {
  snapshot: YieldCurveSnapshot;
  rows: YieldCurveRowView[];
  dataSourceTag: USTYieldCurveDataSourceTag;
  serverErrorMessage: string | null;
  fallbackHint: string | null;
};

function safeIsoFromSavedAt(savedAt: number): string {
  return new Date(savedAt).toISOString();
}

function persistBrowserRows(rowsAsc: GetUSTYieldCurveResponse["rowsAsc"]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BROWSER_LS_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        rowsAsc: dedupeUSTRowsAscending(rowsAsc),
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

function loadBrowserRows():
  | {
      savedAt: number;
      rowsAsc: GetUSTYieldCurveResponse["rowsAsc"];
    }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROWSER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { rowsAsc?: unknown }).rowsAsc)
    ) {
      return null;
    }
    const obj = parsed as { savedAt?: unknown; rowsAsc: unknown[] };
    const savedAt = typeof obj.savedAt === "number" ? obj.savedAt : Date.now();
    return { savedAt, rowsAsc: obj.rowsAsc as GetUSTYieldCurveResponse["rowsAsc"] };
  } catch {
    return null;
  }
}

async function loadUsTreasuryYieldCurveModel(
  comparison: YieldComparisonId,
  serverFn: (input: { data: { comparison: YieldComparisonId } }) => Promise<GetUSTYieldCurveResponse>,
): Promise<UsTreasuryYieldCurveResult> {
  let serverPayload: GetUSTYieldCurveResponse | null = null;
  let serverErrorMessage: string | null = null;

  try {
    console.info(`${LOG} Fetching Treasury yield curve data (${comparison})`);
    serverPayload = await serverFn({ data: { comparison } });
  } catch (e) {
    console.info(`${LOG} Server function threw — ${e instanceof Error ? e.message : String(e)}`);
    serverErrorMessage =
      e instanceof Error ? e.message : "Treasury yield curve data unavailable.";
  }

  if (
    serverPayload?.snapshot &&
    (serverPayload.dataSourceTag === "treasury-live" ||
      serverPayload.dataSourceTag === "treasury-disk-cache")
  ) {
    persistBrowserRows(serverPayload.rowsAsc);
    const tag = serverPayload.dataSourceTag;
    if (tag === "treasury-disk-cache") {
      console.info(`${LOG} Loaded from cache due to fetch error`);
    }

    console.info(`${LOG} Parsed latest date (client): ${serverPayload.snapshot.date}`);
    console.info(`${LOG} Comparison date used (client): ${serverPayload.snapshot.comparisonDate}`);

    return {
      snapshot: serverPayload.snapshot,
      rows: snapshotToRowViews(serverPayload.snapshot),
      dataSourceTag: tag,
      serverErrorMessage: tag === "treasury-disk-cache" ? serverPayload.errorMessage : null,
      fallbackHint:
        tag === "treasury-disk-cache"
          ? "Using cached Treasury data (server disk fallback)"
          : null,
    };
  }

  if (serverPayload?.errorMessage && serverPayload.dataSourceTag === "unavailable") {
    console.info(`${LOG} Treasury payload unavailable banner: ${serverPayload.errorMessage}`);
  }

  const br = loadBrowserRows();
  if (br?.rowsAsc?.length) {
    const rowsAsc = dedupeUSTRowsAscending(br.rowsAsc);
    const snapshot = buildTreasuryYieldSnapshot(
      rowsAsc,
      comparison,
      safeIsoFromSavedAt(br.savedAt),
    );
    if (snapshot) {
      console.info(`${LOG} Loaded from browser localStorage due to fetch error`);
      return {
        snapshot,
        rows: snapshotToRowViews(snapshot),
        dataSourceTag: "browser-local-storage",
        serverErrorMessage: serverErrorMessage ?? serverPayload?.errorMessage ?? null,
        fallbackHint: `Using cached Treasury data (${new Date(br.savedAt).toLocaleString()})`,
      };
    }
  }

  console.info(`${LOG} Using illustrative Treasury-style mock fallback`);
  const snapshot = buildMockYieldCurveSnapshot(comparison);
  return {
    snapshot,
    rows: snapshotToRowViews(snapshot),
    dataSourceTag: "mock-fallback",
    serverErrorMessage:
      serverErrorMessage ?? serverPayload?.errorMessage ?? "Treasury yield curve data unavailable.",
    fallbackHint: "Treasury yield curve data unavailable — using illustrative mock curve",
  };
}

/** Yield Curves (USA) hook — avoids fetching inside presentational components. */
export function useUsTreasuryYieldCurve(comparison: YieldComparisonId, enabled = true) {
  const serverFn = useServerFn(getUSTreasuryYieldCurve);

  return useQuery({
    queryKey: ["yield-curve-us-treasury", comparison],
    queryFn: async () => loadUsTreasuryYieldCurveModel(comparison, serverFn),
    enabled,
    staleTime: 1000 * 60 * 10,
    placeholderData: (prev) => prev,
  });
}
