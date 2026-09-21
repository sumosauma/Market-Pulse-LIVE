/** Bank of England nominal gilt spot curve XLSX parsing — server-side only. */

import XLSX from "xlsx";
import type { YieldMaturity } from "./types";

export const BOE_LATEST_YIELD_CURVE_ZIP_URL =
  "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip";

export const BOE_NOMINAL_DAILY_ARCHIVE_ZIP_URL =
  "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip";

export const BOE_NOMINAL_CURRENT_MONTH_XLSX = /GLC Nominal daily data current month\.xlsx$/i;
export const BOE_NOMINAL_ARCHIVE_XLSX = /GLC Nominal daily data_\d{4}\s+to/i;

export type BoeObservationRow = Readonly<{ date: string; value: number }>;

type SheetKind = "months" | "years";

type BoeGridTarget = Readonly<{
  maturity: YieldMaturity;
  sheet: string;
  kind: SheetKind;
  target: number;
}>;

/** Harmonized grid columns in official BoE nominal spot workbooks. */
export const BOE_HARMONIZED_GRID_TARGETS: readonly BoeGridTarget[] = [
  { maturity: "1M", sheet: "3. spot, short end", kind: "months", target: 1 },
  { maturity: "3M", sheet: "3. spot, short end", kind: "months", target: 3 },
  { maturity: "6M", sheet: "3. spot, short end", kind: "months", target: 6 },
  { maturity: "1Y", sheet: "3. spot, short end", kind: "months", target: 12 },
  { maturity: "2Y", sheet: "4. spot curve", kind: "years", target: 2 },
  { maturity: "5Y", sheet: "4. spot curve", kind: "years", target: 5 },
  { maturity: "10Y", sheet: "4. spot curve", kind: "years", target: 10 },
];

export type BoeDailyByMaturity = Readonly<{
  byMaturity: Map<YieldMaturity, Map<string, number>>;
  sourceFile: string;
}>;


function isoFromExcelSerial(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d?.y || !d.m || !d.d) return null;
  const mm = String(d.m).padStart(2, "0");
  const dd = String(d.d).padStart(2, "0");
  return `${d.y}-${mm}-${dd}`;
}

function findColumnIndex(headerRow: unknown[] | undefined, kind: SheetKind, target: number): number {
  if (!headerRow?.length) return -1;
  const label = kind === "months" ? "months:" : "years:";
  if (headerRow[0] !== label) return -1;
  for (let i = 1; i < headerRow.length; i++) {
    const v = headerRow[i];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (kind === "months" && n === target) return i;
    if (kind === "years" && Math.abs(n - target) < 0.01) return i;
  }
  return -1;
}

/** Parse one official BoE nominal daily XLSX buffer into per-maturity date→yield maps. */
export function parseBoeNominalSpotXlsxBuffer(
  buffer: Buffer,
  sourceFile: string,
): BoeDailyByMaturity {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const byMaturity = new Map<YieldMaturity, Map<string, number>>();

  for (const target of BOE_HARMONIZED_GRID_TARGETS) {
    const sheet = wb.Sheets[target.sheet];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    const headerRow = rows.find((r) => r?.[0] === (target.kind === "months" ? "months:" : "years:"));
    const col = findColumnIndex(headerRow, target.kind, target.target);
    if (col < 0) continue;

    const dateMap = new Map<string, number>();
    for (const row of rows) {
      const serial = row?.[0];
      if (typeof serial !== "number" || serial < 40_000) continue;
      const date = isoFromExcelSerial(serial);
      if (!date) continue;
      const val = row[col];
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      dateMap.set(date, val);
    }

    if (dateMap.size) byMaturity.set(target.maturity, dateMap);
  }

  return { byMaturity, sourceFile };
}

export function mergeBoeDailyMaps(
  base: Map<YieldMaturity, Map<string, number>>,
  addition: BoeDailyByMaturity,
): void {
  for (const [maturity, dates] of addition.byMaturity.entries()) {
    let target = base.get(maturity);
    if (!target) {
      target = new Map<string, number>();
      base.set(maturity, target);
    }
    for (const [date, value] of dates.entries()) {
      target.set(date, value);
    }
  }
}

export function boeMapsToSeriesRows(
  maps: Map<YieldMaturity, Map<string, number>>,
  startDateIso: string,
  endDateIso: string,
): Map<YieldMaturity, BoeObservationRow[]> {
  const out = new Map<YieldMaturity, BoeObservationRow[]>();
  for (const [maturity, dateMap] of maps.entries()) {
    const rows = [...dateMap.entries()]
      .filter(([date]) => date >= startDateIso && date <= endDateIso)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, value]) => ({ date, value }));
    if (rows.length) out.set(maturity, rows);
  }
  return out;
}

/** Pick archive XLSX segments whose year span overlaps [startYear, endYear]. */
export function selectBoeArchiveEntryNames(entryNames: readonly string[], startYear: number): string[] {
  return entryNames.filter((name) => {
    if (!BOE_NOMINAL_ARCHIVE_XLSX.test(name)) return false;
    const m = name.match(/_(\d{4})\s+to\s+(present|\d{4})/i);
    if (!m) return false;
    const from = Number(m[1]);
    const to = m[2]!.toLowerCase() === "present" ? 9999 : Number(m[2]);
    const endYear = new Date().getUTCFullYear();
    return to >= startYear && from <= endYear;
  });
}
