/** Server-side Bank of England history fetch — ZIP/XLSX download and normalize. */

import AdmZip from "adm-zip";
import type { ParsedUkBankOfEnglandHistory, YieldMaturity } from "./types";
import {
  BOE_HARMONIZED_GRID_TARGETS,
  BOE_LATEST_YIELD_CURVE_ZIP_URL,
  BOE_NOMINAL_CURRENT_MONTH_XLSX,
  BOE_NOMINAL_DAILY_ARCHIVE_ZIP_URL,
  boeMapsToSeriesRows,
  mergeBoeDailyMaps,
  parseBoeNominalSpotXlsxBuffer,
  selectBoeArchiveEntryNames,
} from "./boeGiltNominalSpotParse";
import { STRUCTURALLY_MISSING_GB } from "./fetchUkBankOfEnglandCurve";

const LOG = "[GB_CURVE][BoE]";
const FETCH_TIMEOUT_MS = 120_000;
const MAX_HISTORY_LOOKBACK_DAYS = 420;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function lookbackStartIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - MAX_HISTORY_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchZipBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label} HTTP ${res.status} ${body.slice(0, 120)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function extractZipEntries(
  zipBuffer: Buffer,
  nameFilter: (name: string) => boolean,
): { name: string; data: Buffer }[] {
  const zip = new AdmZip(zipBuffer);
  return zip
    .getEntries()
    .filter((e) => !e.isDirectory && nameFilter(e.entryName))
    .map((e) => ({ name: e.entryName, data: e.getData() }));
}

function historyFromMaps(
  maps: Map<YieldMaturity, Map<string, number>>,
  sourceFiles: string[],
  startIso: string,
  endIso: string,
): ParsedUkBankOfEnglandHistory {
  const seriesRows = boeMapsToSeriesRows(maps, startIso, endIso);
  const failedMaturities: YieldMaturity[] = [];
  const series: ParsedUkBankOfEnglandHistory["series"][number][] = [];

  for (const { maturity } of BOE_HARMONIZED_GRID_TARGETS) {
    const rows = seriesRows.get(maturity);
    if (rows?.length) {
      series.push({ maturity, rows });
    } else if (!STRUCTURALLY_MISSING_GB.includes(maturity)) {
      failedMaturities.push(maturity);
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    sourceFiles,
    series,
    failedMaturities: failedMaturities.length ? failedMaturities : undefined,
  };
}

function earliestDateInMaps(maps: Map<YieldMaturity, Map<string, number>>): string | null {
  let min: string | null = null;
  for (const dateMap of maps.values()) {
    for (const date of dateMap.keys()) {
      if (!min || date < min) min = date;
    }
  }
  return min;
}

/** Fetch and normalize BoE nominal gilt zero-coupon spot history (official ZIP/XLSX only). */
export async function fetchUkBankOfEnglandHistory(
  existing?: ParsedUkBankOfEnglandHistory | null,
): Promise<ParsedUkBankOfEnglandHistory> {
  const startIso = lookbackStartIso();
  const endIso = todayIso();
  const startYear = Number(startIso.slice(0, 4));
  const sourceFiles: string[] = [];

  const maps = new Map<YieldMaturity, Map<string, number>>();
  if (existing?.series?.length) {
    for (const s of existing.series) {
      const dateMap = new Map(s.rows.map((r) => [r.date, r.value] as const));
      maps.set(s.maturity, dateMap);
    }
    sourceFiles.push(...(existing.sourceFiles ?? []));
  }

  console.log(`${LOG} Fetching latest yield curve ZIP`);
  const latestZip = await fetchZipBuffer(BOE_LATEST_YIELD_CURVE_ZIP_URL, "latest-yield-curve-data.zip");
  const latestEntries = extractZipEntries(latestZip, (n) => BOE_NOMINAL_CURRENT_MONTH_XLSX.test(n));
  if (!latestEntries.length) {
    throw new Error("Latest BoE ZIP did not contain nominal current-month XLSX");
  }
  for (const entry of latestEntries) {
    const parsed = parseBoeNominalSpotXlsxBuffer(entry.data, entry.name);
    mergeBoeDailyMaps(maps, parsed);
    if (!sourceFiles.includes(entry.name)) sourceFiles.push(entry.name);
  }

  const earliest = earliestDateInMaps(maps);
  const needsArchive = !earliest || earliest > startIso;

  if (needsArchive) {
    console.log(`${LOG} Fetching nominal daily archive ZIP (earliest=${earliest ?? "none"} need<=${startIso})`);
    const archiveZip = await fetchZipBuffer(BOE_NOMINAL_DAILY_ARCHIVE_ZIP_URL, "glcnominalddata.zip");
    const allNames = extractZipEntries(archiveZip, () => true).map((e) => e.name);
    const selected = new Set(selectBoeArchiveEntryNames(allNames, startYear));
    const archiveEntries = extractZipEntries(archiveZip, (n) => selected.has(n));

    for (const entry of archiveEntries) {
      const parsed = parseBoeNominalSpotXlsxBuffer(entry.data, entry.name);
      mergeBoeDailyMaps(maps, parsed);
      if (!sourceFiles.includes(entry.name)) sourceFiles.push(entry.name);
    }
  }

  const history = historyFromMaps(maps, sourceFiles, startIso, endIso);
  if (!history.series.length) {
    throw new Error("No Bank of England nominal spot series parsed from official files");
  }

  const anchor = history.series.find((s) => s.maturity === "10Y") ?? history.series[0];
  console.log(
    `${LOG} Parsed ${history.series.length}/${BOE_HARMONIZED_GRID_TARGETS.length} maturities; ` +
      `10Y rows=${anchor?.rows.length ?? 0} latest=${anchor?.rows.at(-1)?.date ?? "—"}`,
  );

  return history;
}
