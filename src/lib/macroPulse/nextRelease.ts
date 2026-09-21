import { addMonths, monthKey } from "./freshness";
import type { MacroPulseIndicatorId } from "./types";
import { formatPanelDate } from "./format";

export type NextReleaseInfo = Readonly<{
  display: string;
  isEstimated: boolean;
  dateIso?: string | null;
}>;

const FRED_RELEASE_ID: Partial<Record<MacroPulseIndicatorId, number>> = {
  "us-core-cpi": 10,
  "us-core-pce": 54,
  "ea-core-hicp": 251,
  "us-nfp": 50,
  "us-unemployment": 50,
};

const RELEASE_CACHE_MS = 6 * 60 * 60 * 1000;

type ReleaseCache = {
  day: string;
  at: number;
  datesByReleaseId: Map<number, string[]>;
};

let releaseCache: ReleaseCache | null = null;

function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function formatNextExact(dateIso: string): string {
  return formatPanelDate(dateIso);
}

function formatEstimatedDay(date: Date): string {
  return formatPanelDate(date.toISOString().slice(0, 10));
}

function nthBusinessDayUtc(year: number, month: number, nth: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (count < nth) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    if (count < nth) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function ismEstimatedNextRelease(indicatorId: MacroPulseIndicatorId, now: Date): NextReleaseInfo {
  const nth = indicatorId === "ism-manufacturing-pmi" ? 1 : 3;
  const release = nthBusinessDayUtc(now.getUTCFullYear(), now.getUTCMonth() + 1, nth);
  if (now.getTime() >= release.getTime()) {
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const nextRelease = nthBusinessDayUtc(
      nextMonth.getUTCFullYear(),
      nextMonth.getUTCMonth() + 1,
      nth,
    );
    const dateIso = nextRelease.toISOString().slice(0, 10);
    return { display: formatEstimatedDay(nextRelease), isEstimated: true, dateIso };
  }
  const dateIso = release.toISOString().slice(0, 10);
  return { display: formatEstimatedDay(release), isEstimated: true, dateIso };
}

async function loadFredReleaseDates(releaseId: number): Promise<string[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");

  const today = new Date().toISOString().slice(0, 10);
  const url =
    `https://api.stlouisfed.org/fred/release/dates?release_id=${releaseId}` +
    `&api_key=${key}&file_type=json&include_release_dates_with_no_data=true` +
    `&sort_order=asc&realtime_start=${today}&limit=12`;

  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`FRED release dates HTTP ${res.status}`);
  const json = (await res.json()) as { release_dates?: { date: string }[] };
  return (json.release_dates ?? []).map((r) => r.date).filter(Boolean);
}

async function ensureReleaseCache(now: Date): Promise<Map<number, string[]>> {
  const day = now.toISOString().slice(0, 10);
  if (
    releaseCache &&
    releaseCache.day === day &&
    now.getTime() - releaseCache.at < RELEASE_CACHE_MS
  ) {
    return releaseCache.datesByReleaseId;
  }

  const ids = [...new Set(Object.values(FRED_RELEASE_ID).filter((id): id is number => id != null))];
  const datesByReleaseId = new Map<number, string[]>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        datesByReleaseId.set(id, await loadFredReleaseDates(id));
      } catch {
        datesByReleaseId.set(id, []);
      }
    }),
  );

  releaseCache = { day, at: now.getTime(), datesByReleaseId };
  return datesByReleaseId;
}

function swedenEstimatedNextRelease(
  observationDate: string,
  indicatorId: "se-kpif" | "se-unemployment",
): NextReleaseInfo {
  const match = observationDate.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    return { display: "—", isEstimated: true };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = indicatorId === "se-kpif" ? 12 : 15;
  const release = new Date(Date.UTC(year, month + 1, day));

  return {
    display: formatEstimatedDay(release),
    isEstimated: true,
    dateIso: release.toISOString().slice(0, 10),
  };
}

const SCB_MONTH_SLUGS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

function scbNewsMonthSlug(observationDate: string): { year: number; slug: string } | null {
  const match = observationDate.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year: Number(match[1]), slug: SCB_MONTH_SLUGS[monthIndex] };
}

export function parseScbCpiOrdinaryPublication(html: string): string | null {
  const ordinary = html.match(/Ordinary publication[\s\S]{0,160}?(\d{4}-\d{2}-\d{2})/i);
  return ordinary?.[1] ?? null;
}

export function parseScbLfsNextPublishing(html: string): string | null {
  const next = html.match(/Next publishing will be[\s\S]{0,160}?(\d{4}-\d{2}-\d{2})/i);
  return next?.[1] ?? null;
}

function scbNewsUrl(indicatorId: "se-kpif" | "se-unemployment", year: number, slug: string): string {
  if (indicatorId === "se-kpif") {
    return (
      "https://www.scb.se/en/finding-statistics/statistics-by-subject-area/prices-and-economic-trends/price-statistics/consumer-price-index-cpi/pong/statistical-news/" +
      `consumer-price-index-cpi-${slug}-${year}/`
    );
  }
  return (
    "https://www.scb.se/en/finding-statistics/statistics-by-subject-area/labour-market/labour-force-supply/labour-force-surveys-lfs/pong/statistical-news/" +
    `labour-force-surveys-lfs-${slug}-${year}/`
  );
}

type SwedenReleaseCache = {
  at: number;
  byKey: Map<string, NextReleaseInfo>;
};

let swedenReleaseCache: SwedenReleaseCache | null = null;

async function loadSwedenNextRelease(
  indicatorId: "se-kpif" | "se-unemployment",
  observationDate: string,
  now: Date,
): Promise<NextReleaseInfo> {
  const fallback = swedenEstimatedNextRelease(observationDate, indicatorId);
  const parsedObs = scbNewsMonthSlug(observationDate);
  if (!parsedObs) return fallback;

  const cacheKey = `${indicatorId}:${observationDate}`;
  if (swedenReleaseCache && now.getTime() - swedenReleaseCache.at < RELEASE_CACHE_MS) {
    const cached = swedenReleaseCache.byKey.get(cacheKey);
    if (cached) return cached;
  }

  try {
    const url = scbNewsUrl(indicatorId, parsedObs.year, parsedObs.slug);
    const res = await timedFetch(url);
    if (!res.ok) return fallback;
    const html = await res.text();
    const dateIso =
      indicatorId === "se-kpif" ? parseScbCpiOrdinaryPublication(html) : parseScbLfsNextPublishing(html);
    if (!dateIso) return fallback;

    const today = now.toISOString().slice(0, 10);
    if (dateIso < today) return fallback;

    const info: NextReleaseInfo = { display: formatNextExact(dateIso), isEstimated: false, dateIso };
    if (!swedenReleaseCache || now.getTime() - swedenReleaseCache.at >= RELEASE_CACHE_MS) {
      swedenReleaseCache = { at: now.getTime(), byKey: new Map() };
    }
    swedenReleaseCache.byKey.set(cacheKey, info);
    return info;
  } catch {
    return fallback;
  }
}

function fredFallbackRelease(): NextReleaseInfo {
  return { display: "—", isEstimated: true, dateIso: null };
}

/**
 * FRED calendars still list today's date after the print is in.
 * If the series already has last month's observation, skip today and take the following date.
 */
export function pickFredNextReleaseDate(
  dates: string[],
  observationDate: string | null,
  now: Date,
): string | undefined {
  const today = now.toISOString().slice(0, 10);
  const lag1 = addMonths(monthKey(today), -1);
  const obsYm = observationDate ? monthKey(observationDate) : null;
  const alreadyHasLatestPrint = obsYm != null && obsYm >= lag1;
  return dates.find((d) => (alreadyHasLatestPrint ? d > today : d >= today));
}

export async function getNextRelease(
  indicatorId: MacroPulseIndicatorId,
  observationDate: string | null,
  now: Date,
  override?: NextReleaseInfo | null,
): Promise<NextReleaseInfo> {
  const today = now.toISOString().slice(0, 10);
  const overrideStillUpcoming =
    Boolean(override?.display) && (!override?.dateIso || override.dateIso >= today);
  if (overrideStillUpcoming && override) return override;

  if (indicatorId === "ism-manufacturing-pmi" || indicatorId === "ism-services-pmi") {
    return ismEstimatedNextRelease(indicatorId, now);
  }
  if (indicatorId === "se-kpif" || indicatorId === "se-unemployment") {
    if (!observationDate) return { display: "—", isEstimated: true, dateIso: null };
    return loadSwedenNextRelease(indicatorId, observationDate, now);
  }

  const releaseId = FRED_RELEASE_ID[indicatorId];
  if (!releaseId) return fredFallbackRelease();

  try {
    const cache = await ensureReleaseCache(now);
    const dates = cache.get(releaseId) ?? [];
    const next = pickFredNextReleaseDate(dates, observationDate, now);
    if (next) {
      return { display: formatNextExact(next), isEstimated: false, dateIso: next };
    }
  } catch {
    /* fall through */
  }

  return fredFallbackRelease();
}
