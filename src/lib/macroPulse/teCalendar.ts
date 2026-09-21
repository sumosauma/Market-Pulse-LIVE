import { addMonths, monthKey } from "./freshness";
import type { MacroPulseDisplayKind, MacroPulseIndicatorId } from "./types";

export type TeCalendarRow = Readonly<{
  id: string;
  url: string;
  event: string;
  category: string;
  reference: string;
  releaseDateIso: string;
  actual: string;
  previous: string;
  consensus: string;
  teForecast: string;
}>;

export type TeSeriesSpec = Readonly<{
  calendarPath: string;
  /** Lowercase event text must equal one of these when set. */
  eventEquals?: readonly string[];
  /** Drop events whose lowercase name contains any of these. */
  eventExcludes?: readonly string[];
  /**
   * When flash/prelim and final both exist for the same upcoming month, prefer
   * the next unreleased print (earliest date). Kept for call-site docs only —
   * selection is always the next unreleased matching observation.
   */
  preferFinal?: boolean;
}>;

export type TeFetchPageResult = Readonly<{
  kind: "calendar" | "indicator";
  url: string;
  path?: string;
  status: number;
  ok: boolean;
  rowCount: number;
  error?: string;
}>;

export const TE_CALENDAR_PAGES = [
  "https://tradingeconomics.com/calendar",
  "https://tradingeconomics.com/united-states/calendar",
  "https://tradingeconomics.com/euro-area/calendar",
  "https://tradingeconomics.com/sweden/calendar",
] as const;

/**
 * Consensus is read only from the public Trading Economics economic calendar
 * `#consensus` cell (Actual | Previous | Consensus | Forecast).
 * Forecast / Previous / Actual are never used as consensus.
 *
 * Core PCE must use core-pce-price-index-annual-change, not headline PCE.
 * ISM Manufacturing is /united-states/business-confidence, not S&P Global
 * /united-states/manufacturing-pmi.
 */
export const TE_SERIES: Record<MacroPulseIndicatorId, TeSeriesSpec> = {
  "us-core-cpi": { calendarPath: "/united-states/core-inflation-rate" },
  "us-core-pce": { calendarPath: "/united-states/core-pce-price-index-annual-change" },
  "ea-core-hicp": { calendarPath: "/euro-area/core-inflation-rate" },
  "se-kpif": { calendarPath: "/sweden/cpi-with-fixed-interest-rate-yoy" },
  "us-nfp": {
    calendarPath: "/united-states/non-farm-payrolls",
    eventEquals: ["non farm payrolls"],
    eventExcludes: ["revision", "annual"],
  },
  "us-unemployment": { calendarPath: "/united-states/unemployment-rate" },
  "se-unemployment": { calendarPath: "/sweden/unemployment-rate" },
  "ism-services-pmi": { calendarPath: "/united-states/non-manufacturing-pmi" },
  "ism-manufacturing-pmi": { calendarPath: "/united-states/business-confidence" },
};

export const TE_SOURCE_URL: Record<MacroPulseIndicatorId, string> = {
  "us-core-cpi": "https://tradingeconomics.com/united-states/core-inflation-rate",
  "us-core-pce": "https://tradingeconomics.com/united-states/core-pce-price-index-annual-change",
  "ea-core-hicp": "https://tradingeconomics.com/euro-area/core-inflation-rate",
  "se-kpif": "https://tradingeconomics.com/sweden/cpi-with-fixed-interest-rate-yoy",
  "us-nfp": "https://tradingeconomics.com/united-states/non-farm-payrolls",
  "us-unemployment": "https://tradingeconomics.com/united-states/unemployment-rate",
  "se-unemployment": "https://tradingeconomics.com/sweden/unemployment-rate",
  "ism-services-pmi": "https://tradingeconomics.com/united-states/non-manufacturing-pmi",
  "ism-manufacturing-pmi": "https://tradingeconomics.com/united-states/business-confidence",
};

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CALENDAR_TTL_MS = 30 * 60 * 1000;
const RELEASE_DAY_TTL_MS = 5 * 60 * 1000;

type CalendarCache = {
  day: string;
  at: number;
  rows: TeCalendarRow[];
  pages: TeFetchPageResult[];
};

let calendarCache: CalendarCache | null = null;
let lastFetchPages: TeFetchPageResult[] = [];

function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  return fetch(url, {
    signal: ctrl.signal,
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  }).finally(() => clearTimeout(t));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function attr(block: string, name: string): string {
  return block.match(new RegExp(`data-${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function field(block: string, id: string): string {
  const m = block.match(new RegExp(`id=['"]${id}['"][^>]*>([\\s\\S]*?)</`, "i"));
  return stripTags(m?.[1] ?? "");
}

export function isReleasedActual(actual: string): boolean {
  const text = actual.replace(/\u2212/g, "-").trim();
  return text !== "" && text !== "-" && text !== "—" && text !== "–";
}

export function formatObservationLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 0) - 1];
  return name ? `${name} ${y}` : ym;
}

export function parseTeNumeric(raw: string): number | null {
  const text = raw.replace(/,/g, "").replace(/\u2212/g, "-").trim();
  if (!text || text === "-" || text === "—" || text === "–") return null;
  const m = text.match(/^([+-]?\d+(?:\.\d+)?)\s*%?$/i);
  if (m) {
    const n = Number.parseFloat(m[1]!);
    return Number.isFinite(n) ? n : null;
  }
  const k = text.match(/^([+-]?\d+(?:\.\d+)?)\s*k$/i);
  if (k) {
    const n = Number.parseFloat(k[1]!);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Country-calendar rows: `<tr data-url="...">` with `#actual #previous #consensus #forecast`.
 * Split on `data-url` so nested flag `<tr>` cells do not truncate the row.
 */
export function parseTeCalendarHtml(html: string): TeCalendarRow[] {
  const chunks = html.split(/<tr\b[^>]*data-url="/i);
  const rows: TeCalendarRow[] = [];
  for (const chunk of chunks.slice(1)) {
    const url = chunk.match(/^([^"]+)/)?.[1] ?? "";
    const head = chunk.slice(0, 6000);
    rows.push({
      id: attr(chunk, "id"),
      url,
      event: attr(chunk, "event").toLowerCase(),
      category: attr(chunk, "category").toLowerCase(),
      reference: chunk.match(/calendar-reference[^>]*>([^<]*)/i)?.[1]?.trim() ?? "",
      releaseDateIso: chunk.match(/class=['"]\s*(\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? "",
      actual: field(head, "actual"),
      previous: field(head, "previous"),
      consensus: field(head, "consensus"),
      teForecast: field(head, "forecast"),
    });
  }
  return rows;
}

/**
 * Indicator-page calendar: `<tr class="an-estimate-row">` with columns
 * Date | GMT | Event | Reference | Actual | Previous | Consensus | TEForecast.
 * Consensus is a positional `<td>`, not `id="consensus"`.
 */
export function parseTeIndicatorCalendarHtml(html: string, calendarPath: string): TeCalendarRow[] {
  const rows: TeCalendarRow[] = [];
  const matches = html.matchAll(/<tr\b([^>]*class=['"][^'"]*an-estimate-row[^'"]*['"][^>]*)>([\s\S]*?)<\/tr>/gi);
  for (const match of matches) {
    const open = match[1] ?? "";
    const body = match[2] ?? "";
    const tds = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((td) => stripTags(td[1] ?? ""));
    if (tds.length < 6) continue;
    const eventHidden = body.match(/class=['"]d-none['"][^>]*>([\s\S]*?)<\//i);
    const event = stripTags(eventHidden?.[1] ?? attr(open, "category")).toLowerCase();
    const reference =
      field(body, "reference") ||
      tds[3] ||
      "";
    const actual = field(body, "actual") || tds[4] || "";
    const previous = field(body, "previous") || tds[5] || "";
    const consensus = tds[6] ?? "";
    const teForecast = tds[7] ?? "";
    const releaseDateIso = tds[0]?.match(/^(\d{4}-\d{2}-\d{2})$/)?.[1] ?? "";
    rows.push({
      id: attr(open, "id"),
      url: calendarPath,
      event,
      category: attr(open, "category").toLowerCase(),
      reference,
      releaseDateIso,
      actual,
      previous,
      consensus,
      teForecast,
    });
  }
  return rows;
}

export function mergeTeCalendarRows(rows: readonly TeCalendarRow[]): TeCalendarRow[] {
  const map = new Map<string, TeCalendarRow>();
  for (const row of rows) {
    const key = row.id || `${row.url}|${row.releaseDateIso}|${row.event}|${row.reference}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    map.set(key, {
      ...existing,
      ...row,
      actual: row.actual || existing.actual,
      previous: row.previous || existing.previous,
      consensus: row.consensus || existing.consensus,
      teForecast: row.teForecast || existing.teForecast,
      reference: row.reference || existing.reference,
      releaseDateIso: row.releaseDateIso || existing.releaseDateIso,
      event: row.event || existing.event,
    });
  }
  return [...map.values()];
}

export function referenceMonthKey(reference: string, releaseDateIso: string): string | null {
  const mon = MONTH_ABBR[reference.trim().slice(0, 3).toLowerCase()];
  if (!mon || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDateIso)) return null;
  const releaseYear = Number(releaseDateIso.slice(0, 4));
  const releaseMonth = Number(releaseDateIso.slice(5, 7));
  let year = releaseYear;
  if (mon > releaseMonth) year -= 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

export function seriesRowsFor(
  rows: readonly TeCalendarRow[],
  spec: TeSeriesSpec,
): TeCalendarRow[] {
  return rows.filter((row) => {
    if (row.url !== spec.calendarPath) return false;
    if (spec.eventEquals && !spec.eventEquals.includes(row.event)) return false;
    if (spec.eventExcludes?.some((ex) => row.event.includes(ex))) return false;
    return true;
  });
}

export function pickUpcomingTeRow(
  rows: readonly TeCalendarRow[],
  spec: TeSeriesSpec,
  upcomingYm: string,
): TeCalendarRow | null {
  const matching = seriesRowsFor(rows, spec).filter((row) => {
    if (isReleasedActual(row.actual)) return false;
    const refYm = referenceMonthKey(row.reference, row.releaseDateIso);
    return refYm === upcomingYm;
  });
  if (!matching.length) return null;
  matching.sort((a, b) => a.releaseDateIso.localeCompare(b.releaseDateIso));
  return matching[0]!;
}

/** Calendar event for the already-released observation month (latest actual). */
export function pickReleasedTeRow(
  rows: readonly TeCalendarRow[],
  spec: TeSeriesSpec,
  latestYm: string,
): TeCalendarRow | null {
  const matching = seriesRowsFor(rows, spec).filter((row) => {
    if (!isReleasedActual(row.actual)) return false;
    const refYm = referenceMonthKey(row.reference, row.releaseDateIso);
    return refYm === latestYm;
  });
  if (!matching.length) return null;
  matching.sort((a, b) => b.releaseDateIso.localeCompare(a.releaseDateIso));
  return matching[0]!;
}

export function upcomingObservationMonth(latestObservationDate: string): string {
  return addMonths(monthKey(latestObservationDate), 1);
}

export function formatTeConsensusDisplay(
  value: number,
  displayKind: MacroPulseDisplayKind,
): string {
  if (displayKind === "change_thousands") {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded}k`;
    if (rounded < 0) return `${rounded}k`;
    return `${rounded}k`;
  }
  if (displayKind === "index_pts") return value.toFixed(1);
  return `${value.toFixed(1)}%`;
}

export function shouldReuseTeCalendarCache(
  cache: { day: string; at: number; rows: readonly TeCalendarRow[] },
  now: Date,
  ttlMs = CALENDAR_TTL_MS,
): boolean {
  const day = now.toISOString().slice(0, 10);
  if (cache.day !== day) return false;
  const due = cache.rows.some(
    (row) => !isReleasedActual(row.actual) && row.releaseDateIso && row.releaseDateIso <= day,
  );
  const ttl = due ? RELEASE_DAY_TTL_MS : ttlMs;
  return now.getTime() - cache.at < ttl;
}

function recoverMissingSeriesRows(
  fresh: TeCalendarRow[],
  previous: readonly TeCalendarRow[],
  pages: readonly TeFetchPageResult[],
): TeCalendarRow[] {
  if (pages.some((p) => p.ok)) return mergeTeCalendarRows(fresh);
  return previous.length ? [...previous] : mergeTeCalendarRows(fresh);
}

async function fetchPage(url: string): Promise<{ status: number; ok: boolean; text: string; error?: string }> {
  try {
    const res = await timedFetch(url);
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      text: "",
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

export async function fetchTeCalendarRows(now = new Date()): Promise<TeCalendarRow[]> {
  if (calendarCache && shouldReuseTeCalendarCache(calendarCache, now)) {
    lastFetchPages = calendarCache.pages;
    return calendarCache.rows;
  }

  const previous = calendarCache?.rows ?? [];

  const indicatorJobs = Object.values(TE_SOURCE_URL).map(async (url) => {
    const path = url.replace("https://tradingeconomics.com", "");
    const page = await fetchPage(url);
    const rows = page.ok ? parseTeIndicatorCalendarHtml(page.text, path) : [];
    const meta: TeFetchPageResult = {
      kind: "indicator",
      url,
      path,
      status: page.status,
      ok: page.ok,
      rowCount: rows.length,
      error: page.ok ? undefined : page.error ?? `HTTP ${page.status}`,
    };
    return { meta, rows };
  });

  const calendarJobs = TE_CALENDAR_PAGES.map(async (url) => {
    const page = await fetchPage(url);
    const rows = page.ok ? parseTeCalendarHtml(page.text) : [];
    const meta: TeFetchPageResult = {
      kind: "calendar",
      url,
      status: page.status,
      ok: page.ok,
      rowCount: rows.length,
      error: page.ok ? undefined : page.error ?? `HTTP ${page.status}`,
    };
    return { meta, rows };
  });

  const fetched = await Promise.all([...indicatorJobs, ...calendarJobs]);
  const pages = fetched.map((item) => item.meta);
  const collected = fetched.flatMap((item) => item.rows);

  lastFetchPages = pages;
  const allFailed = pages.every((p) => !p.ok);
  if (allFailed && previous.length) {
    return previous;
  }

  const merged = recoverMissingSeriesRows(mergeTeCalendarRows(collected), previous, pages);
  if (!merged.length && previous.length) {
    return previous;
  }

  calendarCache = {
    day: now.toISOString().slice(0, 10),
    at: now.getTime(),
    rows: merged,
    pages,
  };
  return merged;
}

export function getLastTeFetchPages(): readonly TeFetchPageResult[] {
  return lastFetchPages;
}

export function resetTeCalendarCache(): void {
  calendarCache = null;
  lastFetchPages = [];
}
