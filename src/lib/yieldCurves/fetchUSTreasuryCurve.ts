import type {
  ParsedUSTDay,
  USTXmlFieldKey,
  YieldComparisonId,
  YieldCurveSnapshot,
  YieldMaturity,
} from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

const LOG = "[UST_CURVE]";

const FETCH_TIMEOUT_MS = 18_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** Treasury XML publishes one feed per calendar year (`field_tdr_date_value=Y`). */
export const TREASURY_YIELD_CURVE_XML = (calendarYear: number) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${calendarYear}`;

const MATURITY_TO_XML: readonly { maturity: YieldMaturity; field: USTXmlFieldKey }[] = [
  { maturity: "1M", field: "BC_1MONTH" },
  { maturity: "3M", field: "BC_3MONTH" },
  { maturity: "6M", field: "BC_6MONTH" },
  { maturity: "1Y", field: "BC_1YEAR" },
  { maturity: "2Y", field: "BC_2YEAR" },
  { maturity: "5Y", field: "BC_5YEAR" },
  { maturity: "10Y", field: "BC_10YEAR" },
  { maturity: "30Y", field: "BC_30YEAR" },
];

function timedFetchXml(url: string): Promise<Response> {
  return fetch(url, {
    headers: { Accept: "application/xml,text/xml,*/*", "User-Agent": UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function parseBcFromEntry(entryXml: string, field: string): number | null {
  const valued = new RegExp(
    `<d:${field}[^>]*m:type="Edm\\.Double"\\s*>\\s*([0-9.+-]+)\\s*</d:${field}>`,
    "i",
  );
  const mv = valued.exec(entryXml);
  if (mv?.[1]) {
    const n = Number(mv[1]);
    return Number.isFinite(n) ? n : null;
  }
  const selfClosing = new RegExp(`<d:${field}[^>]*/>`);
  if (selfClosing.test(entryXml)) return null;
  return null;
}

function parseTreasuryYieldXmlFeed(xml: string): ParsedUSTDay[] {
  const rows: ParsedUSTDay[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const dateM = /<d:NEW_DATE[^>]*m:type="Edm.DateTime">\s*(\d{4}-\d{2}-\d{2})/i.exec(block);
    if (!dateM) continue;
    const date = dateM[1];
    const yields: Partial<Record<USTXmlFieldKey, number>> = {};
    const fields = MATURITY_TO_XML.map((x) => x.field);
    for (const f of fields) {
      const v = parseBcFromEntry(block, f);
      if (v !== null) yields[f] = v;
    }
    rows.push({ date, yields });
  }
  return rows;
}

export function dedupeUSTRowsAscending(rows: ParsedUSTDay[]): ParsedUSTDay[] {
  const map = new Map<string, ParsedUSTDay>();
  for (const r of rows) {
    map.set(r.date, r);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, v]) => v);
}

/** Pull last N calendar years of XML feeds in parallel — enough for historical comparisons. */
export async function fetchUsTreasuryYieldHistoryRowsAsc(): Promise<ParsedUSTDay[]> {
  const yNow = new Date().getUTCFullYear();
  const years = [yNow - 2, yNow - 1, yNow];
  console.log(`${LOG} Fetching Treasury yield curve XML for years=${years.join(",")}`);
  const results = await Promise.all(
    years.map(async (y) => {
      const url = TREASURY_YIELD_CURVE_XML(y);
      const res = await timedFetchXml(url);
      const text = await res.text();
      if (!res.ok) {
        console.log(`${LOG} Year ${y} HTTP ${res.status}`);
        throw new Error(`Treasury HTTP ${res.status} for ${y}`);
      }
      const rows = parseTreasuryYieldXmlFeed(text);
      console.log(`${LOG} Year ${y} parsed ${rows.length} daily observations`);
      return rows;
    }),
  );
  return dedupeUSTRowsAscending(results.flat());
}

function addUtcDays(dateIsoYYYYMMDD: string, deltaDays: number): string {
  const d = new Date(`${dateIsoYYYYMMDD}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Latest treasury row whose date ≤ target (rows sorted ascending by date). */
export function nearestTreasuryObservationOnOrBefore(
  sortedAsc: ParsedUSTDay[],
  targetDateIso: string,
): ParsedUSTDay | null {
  let best: ParsedUSTDay | null = null;
  for (const r of sortedAsc) {
    if (r.date <= targetDateIso) best = r;
    else break;
  }
  return best;
}

function pickPriorSession(sortedAsc: ParsedUSTDay[], latest: ParsedUSTDay): ParsedUSTDay | null {
  const i = sortedAsc.findIndex((r) => r.date === latest.date);
  return i > 0 ? sortedAsc[i - 1]! : null;
}

export function resolveComparisonObservation(
  sortedAsc: ParsedUSTDay[],
  latest: ParsedUSTDay,
  comparisonId: YieldComparisonId,
): { row: ParsedUSTDay | null; comparisonDateTarget: string; mode: string } {
  const L = latest.date;
  switch (comparisonId) {
    case "Today": {
      const row = pickPriorSession(sortedAsc, latest);
      return { row, comparisonDateTarget: row?.date ?? "prior-session", mode: "prior-session" };
    }
    case "1D":
      return {
        row: nearestTreasuryObservationOnOrBefore(sortedAsc, addUtcDays(L, -1)),
        comparisonDateTarget: addUtcDays(L, -1),
        mode: "calendar-minus-1",
      };
    case "1W":
      return {
        row: nearestTreasuryObservationOnOrBefore(sortedAsc, addUtcDays(L, -7)),
        comparisonDateTarget: addUtcDays(L, -7),
        mode: "calendar-minus-7",
      };
    case "1M":
      return {
        row: nearestTreasuryObservationOnOrBefore(sortedAsc, addUtcDays(L, -31)),
        comparisonDateTarget: addUtcDays(L, -31),
        mode: "calendar-minus-31",
      };
    case "3M":
      return {
        row: nearestTreasuryObservationOnOrBefore(sortedAsc, addUtcDays(L, -93)),
        comparisonDateTarget: addUtcDays(L, -93),
        mode: "calendar-minus-93",
      };
    case "1Y":
      return {
        row: nearestTreasuryObservationOnOrBefore(sortedAsc, addUtcDays(L, -366)),
        comparisonDateTarget: addUtcDays(L, -366),
        mode: "calendar-minus-366",
      };
    default:
      return { row: null, comparisonDateTarget: "", mode: "unknown" };
  }
}

function yieldFor(day: ParsedUSTDay, field: USTXmlFieldKey): number | null {
  const v = day.yields[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildTreasuryYieldSnapshot(
  sortedAsc: ParsedUSTDay[],
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  if (!sortedAsc.length) return null;
  const latest = sortedAsc[sortedAsc.length - 1]!;
  const { row: cmp, comparisonDateTarget, mode } = resolveComparisonObservation(
    sortedAsc,
    latest,
    comparisonId,
  );

  console.log(`${LOG} Parsed latest date (Treasury observation): ${latest.date}`);
  console.log(
    `${LOG} Comparison date target: ${comparisonDateTarget}` +
      (cmp ? ` → using Treasury row ${cmp.date}` : "") +
      ` (mode=${mode})`,
  );

  const points = MATURITY_TO_XML.map(({ maturity, field }) => {
    const cu = yieldFor(latest, field);
    const co = cmp ? yieldFor(cmp, field) : null;
    const changeBps =
      cu !== null && co !== null ? (cu - co) * 100 : null;
    return {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield: cu,
      comparisonYield: co,
      changeBps,
    };
  });

  const comparisonDateResolved = cmp?.date ?? "";

  return {
    countryId: "US",
    country: "United States",
    date: latest.date,
    comparisonDate: comparisonDateResolved || comparisonDateTarget,
    source: "U.S. Treasury",
    updatedAt: updatedAtIso,
    points,
  };
}

export { snapshotToRowViews } from "./rowViews";
