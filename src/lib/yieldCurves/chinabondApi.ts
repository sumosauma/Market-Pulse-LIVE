/** ChinaBond / CCDC MOF–China government bond yield curve API — server-side only. */

import type { YieldMaturity } from "./types";

const LOG = "[CN_CURVE][ChinaBond]";
const API_BASE = "https://yield.chinabond.com.cn/cbweb-czb-web/czb/historyQuery";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_QUERY_DAYS = 364;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** qxmc=1 → MOF–China Government Bond Yield Curve (national treasury). */
export const CHINABOND_QXMC_TREASURY = "1";

export type ChinaBondObservationRow = Readonly<{ date: string; value: number }>;

export type ChinaBondApiRow = Readonly<{
  workTime?: string;
  threeMonth?: string | null;
  sixMonth?: string | null;
  oneYear?: string | null;
  twoYear?: string | null;
  fiveYear?: string | null;
  tenYear?: string | null;
  thirtyYear?: string | null;
  qxmc?: string;
}>;

type ChinaBondHistoryResponse = Readonly<{
  flag?: string;
  heList?: readonly ChinaBondApiRow[];
}>;

/** Harmonized grid → official ChinaBond historyQuery response fields. */
export const CHINABOND_HARMONIZED_FIELDS: readonly {
  maturity: YieldMaturity;
  field: keyof Pick<
    ChinaBondApiRow,
    "threeMonth" | "sixMonth" | "oneYear" | "twoYear" | "fiveYear" | "tenYear" | "thirtyYear"
  >;
}[] = [
  { maturity: "3M", field: "threeMonth" },
  { maturity: "6M", field: "sixMonth" },
  { maturity: "1Y", field: "oneYear" },
  { maturity: "2Y", field: "twoYear" },
  { maturity: "5Y", field: "fiveYear" },
  { maturity: "10Y", field: "tenYear" },
  { maturity: "30Y", field: "thirtyYear" },
];

function parseYieldString(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const v = parseFloat(String(raw));
  return Number.isFinite(v) ? v : null;
}

export function buildChinaBondHistoryUrl(startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    startDate,
    endDate,
    gjqx: "0",
    locale: "en_US",
    qxmc: CHINABOND_QXMC_TREASURY,
  });
  return `${API_BASE}?${params.toString()}`;
}

export function dateRangeChunks(
  startIso: string,
  endIso: string,
  maxDays = MAX_QUERY_DAYS,
): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const effectiveEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: effectiveEnd.toISOString().slice(0, 10),
    });
    cursor = new Date(effectiveEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

async function fetchChinaBondChunk(url: string): Promise<ChinaBondApiRow[]> {
  const headers = { Accept: "application/json", "User-Agent": UA } as const;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        throw new Error(`ChinaBond HTTP ${res.status} ${body.slice(0, 120)}`);
      }

      const json = (await res.json()) as ChinaBondHistoryResponse;
      if (json.flag === "1" || !json.heList?.length) return [];
      return [...json.heList];
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  return [];
}

/** Fetch official MOF–China government bond history for a date range (splits >364d). */
export async function fetchChinaBondHistoryRows(
  startIso: string,
  endIso: string,
): Promise<ChinaBondApiRow[]> {
  const chunks = dateRangeChunks(startIso, endIso);
  const byDate = new Map<string, ChinaBondApiRow>();

  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i]!;
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const url = buildChinaBondHistoryUrl(start, end);
    console.log(`${LOG} Fetch chunk ${start} → ${end}`);
    const rows = await fetchChinaBondChunk(url);
    for (const row of rows) {
      const date = row.workTime;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      byDate.set(date, row);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row);
}

export function chinaBondRowsToSeries(
  rows: readonly ChinaBondApiRow[],
): Map<YieldMaturity, ChinaBondObservationRow[]> {
  const series = new Map<YieldMaturity, ChinaBondObservationRow[]>();

  for (const { maturity, field } of CHINABOND_HARMONIZED_FIELDS) {
    const obs: ChinaBondObservationRow[] = [];
    for (const row of rows) {
      const date = row.workTime;
      if (!date) continue;
      const value = parseYieldString(row[field]);
      if (value === null) continue;
      obs.push({ date, value });
    }
    if (obs.length) series.set(maturity, obs);
  }

  return series;
}
