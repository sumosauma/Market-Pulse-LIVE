import { createServerFn } from "@tanstack/react-start";
import type { GetUSTYieldCurveResponse, ParsedUSTDay, YieldComparisonId } from "./types";
import { buildTreasuryYieldSnapshot, fetchUsTreasuryYieldHistoryRowsAsc } from "./fetchUSTreasuryCurve";

const LOG = "[UST_CURVE]";
const UST_ROW_CACHE_PATH = "data/cache/ust-treasury-yield-rows.json";

type DiskEnvelope = { savedAt: string; rowsAsc: ParsedUSTDay[] };

function saveUSTRowsDisk(rowsAsc: ParsedUSTDay[]): void {
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(UST_ROW_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const env: DiskEnvelope = { savedAt: new Date().toISOString(), rowsAsc };
    writeFileSync(UST_ROW_CACHE_PATH, JSON.stringify(env, null, 2), "utf8");
    console.log(`${LOG} Wrote persistent row cache (${rowsAsc.length} days) → ${UST_ROW_CACHE_PATH}`);
  } catch {
    console.log(`${LOG} Persistent row cache write skipped (read-only filesystem or Workers)`);
  }
}

function loadUSTRowsDisk(): ParsedUSTDay[] | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(UST_ROW_CACHE_PATH)) return null;
    const env = JSON.parse(readFileSync(UST_ROW_CACHE_PATH, "utf8")) as DiskEnvelope;
    const rows = Array.isArray(env?.rowsAsc) ? env.rowsAsc : [];
    console.log(`${LOG} Loaded from disk persistent row cache (${rows.length} rows) savedAt=${env.savedAt ?? "?"}`);
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

async function assembleRowsAscending(): Promise<{ rowsAsc: ParsedUSTDay[]; fetchedLive: boolean }> {
  try {
    console.log(`${LOG} Fetching Treasury yield curve data`);
    const rowsAsc = await fetchUsTreasuryYieldHistoryRowsAsc();
    if (rowsAsc.length) saveUSTRowsDisk(rowsAsc);
    return { rowsAsc, fetchedLive: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${LOG} Loaded from cache due to fetch error — ${msg}`);
    const cached = loadUSTRowsDisk();
    return { rowsAsc: cached ?? [], fetchedLive: false };
  }
}

export interface USTYieldCurveInput {
  comparison: YieldComparisonId;
}

/** Server loader for Yield Curves only — isolated from `/` market overview fetching. */
export const getUSTreasuryYieldCurve = createServerFn({ method: "POST" })
  .inputValidator((data: USTYieldCurveInput) => data)
  .handler(async ({ data }): Promise<GetUSTYieldCurveResponse> => {
    const comparison = data.comparison;
    const updatedAtIso = new Date().toISOString();

    const { rowsAsc, fetchedLive } = await assembleRowsAscending();
    if (!rowsAsc.length) {
      console.log(`${LOG} No Treasury rows available (live + persistent cache)`);
      return {
        snapshot: null,
        rowsAsc: [],
        errorMessage: "Treasury yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
      };
    }

    const snapshot = buildTreasuryYieldSnapshot(rowsAsc, comparison, updatedAtIso);
    if (!snapshot) {
      return {
        snapshot: null,
        rowsAsc: [],
        errorMessage: "Treasury yield curve data unavailable.",
        dataSourceTag: "unavailable",
        updatedAtISO: updatedAtIso,
      };
    }

    const tag = fetchedLive ? ("treasury-live" as const) : ("treasury-disk-cache" as const);

    console.log(`${LOG} Data source used: ${tag}`);

    return {
      snapshot,
      rowsAsc,
      errorMessage: null,
      dataSourceTag: tag,
      updatedAtISO: updatedAtIso,
    };
  });
