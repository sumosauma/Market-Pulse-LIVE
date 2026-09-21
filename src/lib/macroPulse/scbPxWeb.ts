import { isObservationStale } from "./freshness";
import { scbMonthToIso } from "./format";
import type { MacroPulseIndicatorId } from "./types";

const SCB_BASE = "https://statistikdatabasen.scb.se/api/v2";
const METADATA_CACHE_MS = 6 * 60 * 60 * 1000;

type JsonStat2 = {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number> } }>;
  value: Record<string, number>;
};

type ScbMetadataJson = {
  dimension?: {
    Tid?: {
      category?: {
        index?: Record<string, number>;
      };
    };
  };
};

export type ScbDecodedRow = Record<string, string | number>;

const metadataCache = new Map<string, { at: number; months: string[] }>();

const SCB_TABLE_INDICATOR: Record<string, MacroPulseIndicatorId> = {
  TAB6590: "se-kpif",
  TAB6387: "se-unemployment",
};

export function decodeJsonStat2(ds: JsonStat2): ScbDecodedRow[] {
  const { id: dims, size: sizes } = ds;
  const out: ScbDecodedRow[] = [];
  for (const [k, v] of Object.entries(ds.value)) {
    let rem = Number(k);
    const coords: ScbDecodedRow = {};
    for (let i = dims.length - 1; i >= 0; i--) {
      const dim = dims[i];
      const size = sizes[i];
      const idx = rem % size;
      rem = Math.floor(rem / size);
      const code = Object.keys(ds.dimension[dim].category.index).find(
        (c) => ds.dimension[dim].category.index[c] === idx,
      );
      coords[dim] = code ?? String(idx);
    }
    coords.value = v;
    out.push(coords);
  }
  return out;
}

function compareScbMonth(a: string, b: string): number {
  const parse = (m: string): number => {
    const match = m.match(/^(\d{4})M(\d{2})$/);
    if (!match) return 0;
    return Number(match[1]) * 100 + Number(match[2]);
  };
  return parse(a) - parse(b);
}

function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** Fetch table metadata and return all valid `Tid` codes in chronological order. */
export async function fetchScbMetadata(tableId: string, now = new Date()): Promise<string[]> {
  const cached = metadataCache.get(tableId);
  if (cached && Date.now() - cached.at < METADATA_CACHE_MS) {
    const latest = cached.months.at(-1);
    const indicator = SCB_TABLE_INDICATOR[tableId];
    const cachedStillCurrent =
      !latest ||
      !indicator ||
      !isObservationStale(indicator, scbMonthToIso(latest), now);
    if (cachedStillCurrent) return cached.months;
  }

  const url = `${SCB_BASE}/tables/${tableId}/metadata?lang=en`;
  const res = await timedFetch(url);
  if (!res.ok) {
    throw new Error(`SCB metadata HTTP ${res.status} (${tableId})`);
  }

  const json = (await res.json()) as ScbMetadataJson;
  const index = json?.dimension?.Tid?.category?.index;
  if (!index || !Object.keys(index).length) {
    throw new Error(`SCB metadata missing Tid dimension (${tableId})`);
  }

  const months = Object.keys(index).sort(compareScbMonth);
  metadataCache.set(tableId, { at: Date.now(), months });
  return months;
}

/** Select the latest N published months confirmed by SCB metadata. */
export function getLatestScbMonths(allMonths: string[], count: number): string[] {
  if (allMonths.length < count) {
    throw new Error(`SCB metadata has fewer than ${count} published Tid values`);
  }
  return allMonths.slice(-count);
}

function buildScbDataUrl(tableId: string, valueCodes: Record<string, string>): string {
  const parts = ["lang=en", "outputFormat=json-stat2"];
  for (const [dim, raw] of Object.entries(valueCodes)) {
    const encoded = raw
      .split(",")
      .map((code) => encodeURIComponent(code.trim()))
      .join(",");
    parts.push(`valueCodes[${dim}]=${encoded}`);
  }
  return `${SCB_BASE}/tables/${tableId}/data?${parts.join("&")}`;
}

export async function fetchScbTable(url: string): Promise<ScbDecodedRow[]> {
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`SCB HTTP ${res.status}`);
  const json = (await res.json()) as JsonStat2;
  if (!json?.value || !Object.keys(json.value).length) throw new Error("No SCB data");
  return decodeJsonStat2(json);
}

/** Latest published KPIF YoY (000007ZM) and MoM (000007ZO). */
export async function fetchScbKpif(): Promise<{
  observationMonth: string;
  yoy: number;
  previousYoy: number | null;
  mom: number;
}> {
  const months = getLatestScbMonths(await fetchScbMetadata("TAB6590"), 3);
  const url = buildScbDataUrl("TAB6590", {
    Tid: months.join(","),
    ContentsCode: "000007ZM,000007ZO",
  });
  const rows = await fetchScbTable(url);

  const yoyRows = rows
    .filter((r) => r.ContentsCode === "000007ZM" && typeof r.Tid === "string")
    .sort((a, b) => String(b.Tid).localeCompare(String(a.Tid)));
  const momRows = rows
    .filter((r) => r.ContentsCode === "000007ZO" && typeof r.Tid === "string")
    .sort((a, b) => String(b.Tid).localeCompare(String(a.Tid)));

  const latestYoy = yoyRows[0];
  const priorYoy = yoyRows[1];
  const latestMom = momRows.find((r) => r.Tid === latestYoy?.Tid) ?? momRows[0];
  if (!latestYoy || typeof latestYoy.value !== "number" || !latestMom || typeof latestMom.value !== "number") {
    throw new Error("SCB KPIF parse failed");
  }

  return {
    observationMonth: String(latestYoy.Tid),
    yoy: latestYoy.value,
    previousYoy: priorYoy && typeof priorYoy.value === "number" ? priorYoy.value : null,
    mom: latestMom.value,
  };
}

/** Latest two published months of seasonally adjusted unemployment (ALÖSP). */
export async function fetchScbUnemployment(): Promise<{
  observationMonth: string;
  level: number;
  previousLevel: number;
}> {
  const months = getLatestScbMonths(await fetchScbMetadata("TAB6387"), 4);
  const url = buildScbDataUrl("TAB6387", {
    Tid: months.join(","),
    Arbetskraftstillh: "ALÖSP",
    TypData: "TC_DATA",
    ContentsCode: "000007L9",
  });
  const rows = await fetchScbTable(url);
  const levels = rows
    .filter((r) => r.ContentsCode === "000007L9" && typeof r.Tid === "string")
    .sort((a, b) => String(b.Tid).localeCompare(String(a.Tid)));

  if (levels.length < 2 || typeof levels[0].value !== "number" || typeof levels[1].value !== "number") {
    throw new Error("SCB unemployment parse failed");
  }

  return {
    observationMonth: String(levels[0].Tid),
    level: levels[0].value,
    previousLevel: levels[1].value,
  };
}
