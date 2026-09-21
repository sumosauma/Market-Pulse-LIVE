import { expectedObservationMonth, monthKey, shouldReuseCachedSnapshot } from "./freshness";
import type { MacroPulseIndicatorId } from "./types";
import { formatPanelDate } from "./format";

export type IsmPmiKind = "manufacturing" | "services";

export type IsmPmiSnapshot = Readonly<{
  latest: number;
  previous: number;
  observationDate: string;
  reportUrl: string;
  nextReleaseDisplay: string | null;
  nextReleaseIsEstimated: boolean;
  nextReleaseDate: string | null;
}>;

const ISM_FETCH_UA = "curl/8.0";
const FETCH_TIMEOUT_MS = 15_000;
const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;
const DISK_CACHE_PATH = "data/cache/ism-pmi.json";

const MONTH_SLUGS = [
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

const URL_SEGMENT: Record<IsmPmiKind, string> = {
  manufacturing: "pmi",
  services: "services",
};

const PMI_LABEL: Record<IsmPmiKind, string> = {
  manufacturing: "Manufacturing PMI",
  services: "Services PMI",
};

type DiskCacheFile = {
  savedAt: string;
  snapshots: Partial<Record<IsmPmiKind, IsmPmiSnapshot>>;
};

type MemoryEntry = { at: number; snapshot: IsmPmiSnapshot };

const memoryCache = new Map<IsmPmiKind, MemoryEntry>();

function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {
    signal: ctrl.signal,
    headers: { "User-Agent": ISM_FETCH_UA, Accept: "text/html" },
    redirect: "follow",
  }).finally(() => clearTimeout(t));
}

function normalizeHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, " ")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#174;|&reg;/gi, "")
    .replace(/®/g, "")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function monthSlugToIndex(slug: string): number {
  const idx = MONTH_SLUGS.indexOf(slug as (typeof MONTH_SLUGS)[number]);
  return idx >= 0 ? idx : -1;
}

function observationIso(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function reportUrl(kind: IsmPmiKind, monthSlug: string): string {
  return `https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/${URL_SEGMENT[kind]}/${monthSlug}/`;
}

function isValidPmi(value: number): boolean {
  return Number.isFinite(value) && value >= 25 && value <= 75;
}

function roundPmi(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseNextRelease(text: string): { display: string; dateIso: string } | null {
  const match = text.match(
    /next ISM[\s\S]{10,320}? on (?:Monday|Tuesday|Wednesday|Thursday|Friday),?\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i,
  );
  if (!match) return null;

  const monthNames = [
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
  ];
  const monthIdx = monthNames.indexOf(match[1].toLowerCase());
  if (monthIdx < 0) return null;

  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !year) return null;

  const dateIso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { display: formatPanelDate(dateIso), dateIso };
}

function parsePreviousPmi(kind: IsmPmiKind, text: string, latest: number): number | null {
  const label = PMI_LABEL[kind];

  const priorExplicit = text.match(
    new RegExp(
      `${label}\\s+registered\\s+[\\d.]+\\s+percent,?\\s+an?\\s+(?:increase|decrease)\\s+of\\s+[\\d.]+\\s+percentage points?\\s+compared to\\s+\\w+(?:'s)?\\s+figure of\\s+([\\d.]+)\\s+percent`,
      "i",
    ),
  )?.[1];
  if (priorExplicit) {
    const previous = Number(priorExplicit);
    if (isValidPmi(previous)) return previous;
  }

  const mfgDelta = text.match(
    new RegExp(
      `${label}\\s+registered\\s+([\\d.]+)\\s+percent\\s+in\\s+\\w+,?\\s+([\\d.]+)\\s+percentage points?\\s+(higher|lower)\\s+than\\s+in\\s+\\w+`,
      "i",
    ),
  );
  if (mfgDelta) {
    const latestFromBody = Number(mfgDelta[1]);
    const delta = Number(mfgDelta[2]);
    const previous =
      mfgDelta[3].toLowerCase() === "higher" ? latestFromBody - delta : latestFromBody + delta;
    if (isValidPmi(previous)) return roundPmi(previous);
  }

  const aboveBelow = text.match(
    new RegExp(
      `${label}\\s+registered\\s+[\\d.]+\\s+percent\\s+in\\s+\\w+,?\\s+([\\d.]+)\\s+percentage points?\\s+(above|below)\\s+the\\s+\\w+\\s+figure`,
      "i",
    ),
  );
  if (aboveBelow) {
    const delta = Number(aboveBelow[1]);
    const previous = aboveBelow[2].toLowerCase() === "above" ? latest - delta : latest + delta;
    if (isValidPmi(previous)) return roundPmi(previous);
  }

  if (kind === "services") {
    const priorShort = text.match(
      /Services PMI\s+registered\s+[\d.]+\s+percent,\s+an?\s+(?:increase|decrease)\s+of\s+[\d.]+\s+percentage points?\s+compared to\s+\w+(?:'s)?\s+figure of\s+([\d.]+)\s+percent/i,
    )?.[1];
    if (priorShort) {
      const previous = Number(priorShort);
      if (isValidPmi(previous)) return previous;
    }
  }

  const glanceTable = text.match(
    new RegExp(`${label}\\s+([\\d.]+)\\s+([\\d.]+)\\s+[+-]?[\\d.]+`, "i"),
  );
  if (glanceTable) {
    const tablePrev = Number(glanceTable[2]);
    if (isValidPmi(tablePrev)) return tablePrev;
  }

  return null;
}

function indicatorIdForKind(kind: IsmPmiKind): MacroPulseIndicatorId {
  return kind === "manufacturing" ? "ism-manufacturing-pmi" : "ism-services-pmi";
}

function snapshotCoversExpectedMonth(kind: IsmPmiKind, snapshot: IsmPmiSnapshot, now: Date): boolean {
  const expectedYm = expectedObservationMonth(indicatorIdForKind(kind), now);
  return snapshot.observationDate.slice(0, 7) >= expectedYm;
}

function isFutureObservation(observationDate: string, now: Date): boolean {
  return monthKey(observationDate) > monthKey(now.toISOString().slice(0, 10));
}

function preferNewerSnapshot(a: IsmPmiSnapshot | undefined, b: IsmPmiSnapshot | undefined): IsmPmiSnapshot | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return monthKey(a.observationDate) >= monthKey(b.observationDate) ? a : b;
}

export function parseIsmReportHtml(
  kind: IsmPmiKind,
  html: string,
  reportPageUrl: string,
): IsmPmiSnapshot | null {
  const text = normalizeHtmlText(html);
  const label = PMI_LABEL[kind];

  const headline = text.match(new RegExp(`${label}\\s+at\\s+([\\d.]+)%`, "i"))?.[1];
  const monthMatch = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+ISM/i,
  );
  if (!headline || !monthMatch) return null;

  const latest = Number(headline);
  if (!isValidPmi(latest)) return null;

  const monthIdx = monthSlugToIndex(monthMatch[1].toLowerCase());
  const year = Number(monthMatch[2]);
  if (monthIdx < 0 || !year) return null;

  const previous = parsePreviousPmi(kind, text, latest);
  if (previous === null || !isValidPmi(previous)) return null;

  const next = parseNextRelease(text);

  return {
    latest,
    previous,
    observationDate: observationIso(year, monthIdx),
    reportUrl: reportPageUrl,
    nextReleaseDisplay: next?.display ?? null,
    nextReleaseIsEstimated: !next,
    nextReleaseDate: next?.dateIso ?? null,
  };
}

function candidateMonthSlugs(now: Date): ReadonlyArray<{ slug: string; year: number; monthIndex: number }> {
  const out: { slug: string; year: number; monthIndex: number }[] = [];
  for (let offset = 0; offset < 4; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const monthIndex = d.getUTCMonth();
    out.push({
      slug: MONTH_SLUGS[monthIndex],
      year: d.getUTCFullYear(),
      monthIndex,
    });
  }
  return out;
}

async function fetchLatestSnapshot(kind: IsmPmiKind, now: Date): Promise<IsmPmiSnapshot> {
  const candidates = candidateMonthSlugs(now);
  const expectedYm = expectedObservationMonth(indicatorIdForKind(kind), now);
  const expectedSlug = MONTH_SLUGS[Number(expectedYm.slice(5, 7)) - 1];
  let lastError = "No ISM report page returned parseable PMI data";

  for (const { slug, year, monthIndex } of candidates) {
    const url = reportUrl(kind, slug);
    try {
      const res = await timedFetch(url);
      if (!res.ok) {
        lastError = `ISM HTTP ${res.status} for ${slug}`;
        continue;
      }
      const html = await res.text();
      if (html.includes("captcha_form")) {
        lastError = "ISM returned bot protection page";
        continue;
      }
      const parsed = parseIsmReportHtml(kind, html, url);
      if (!parsed) {
        lastError = `ISM page for ${slug} missing expected PMI fields`;
        if (slug === expectedSlug) break;
        continue;
      }
      if (parsed.observationDate !== observationIso(year, monthIndex)) {
        lastError = `ISM page for ${slug} observation ${parsed.observationDate} did not match ${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        continue;
      }
      if (isFutureObservation(parsed.observationDate, now)) {
        lastError = `ISM page for ${slug} is a future observation`;
        continue;
      }
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "ISM fetch failed";
    }
  }

  throw new Error(lastError);
}

function readDiskCache(): DiskCacheFile | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path") as typeof import("path");
    const fp = join(DISK_CACHE_PATH);
    if (!existsSync(fp)) return null;
    const raw = JSON.parse(readFileSync(fp, "utf8")) as DiskCacheFile;
    if (!raw?.snapshots || typeof raw.savedAt !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeDiskCache(snapshots: Partial<Record<IsmPmiKind, IsmPmiSnapshot>>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname, join } = require("path") as typeof import("path");
    const fp = join(DISK_CACHE_PATH);
    const dir = dirname(fp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fp, JSON.stringify({ savedAt: new Date().toISOString(), snapshots }, null, 2), "utf8");
  } catch {
    /* read-only filesystem */
  }
}

export function ismKindForIndicator(id: MacroPulseIndicatorId): IsmPmiKind | null {
  if (id === "ism-manufacturing-pmi") return "manufacturing";
  if (id === "ism-services-pmi") return "services";
  return null;
}

export async function fetchIsmPmiSnapshot(
  kind: IsmPmiKind,
  now = new Date(),
): Promise<{ snapshot: IsmPmiSnapshot; fromCache: boolean }> {
  const cachedMem = memoryCache.get(kind);
  if (
    cachedMem &&
    shouldReuseCachedSnapshot({
      cachedAt: cachedMem.at,
      now,
      ttlMs: MEMORY_CACHE_MS,
      indicatorId: indicatorIdForKind(kind),
      observationDate: cachedMem.snapshot.observationDate,
      nextReleaseDate: cachedMem.snapshot.nextReleaseDate,
    }) &&
    snapshotCoversExpectedMonth(kind, cachedMem.snapshot, now)
  ) {
    return { snapshot: cachedMem.snapshot, fromCache: true };
  }

  const disk = readDiskCache();
  try {
    const snapshot = await fetchLatestSnapshot(kind, now);
    memoryCache.set(kind, { at: now.getTime(), snapshot });
    writeDiskCache({ ...(disk?.snapshots ?? {}), [kind]: snapshot });
    return { snapshot, fromCache: false };
  } catch (err) {
    const diskSnap = disk?.snapshots?.[kind];
    const fallback = preferNewerSnapshot(cachedMem?.snapshot, diskSnap);
    if (fallback) {
      memoryCache.set(kind, { at: now.getTime(), snapshot: fallback });
      return { snapshot: fallback, fromCache: true };
    }
    throw err;
  }
}
