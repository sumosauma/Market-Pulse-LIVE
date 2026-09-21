/**
 * Public front-page / section-page headline extraction (metadata only — no article bodies).
 */

import { decodeXmlText } from "./rss";
import type { RawHeadline } from "./topNewsRanking";
import { normalizeUrl } from "./topNewsRanking";

export type HeadlineOrigin = "rss" | "front_page" | "markets_page" | "breaking";

export type FrontPageTier =
  | "main_lead"
  | "secondary_lead"
  | "breaking"
  | "top_module"
  | "lower_module";

export interface FrontPageCandidate {
  source: string;
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string | null;
  frontPageTier: FrontPageTier;
  /** 1-based position within tier/module list (for top_module scoring bands). */
  modulePosition: number;
  origin: HeadlineOrigin;
}

export interface FrontPageFetchStatus {
  sourceLabel: string;
  attempted: string[];
  ok: boolean;
  blocked: boolean;
  candidateCount: number;
  note?: string;
}

const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const DI_BASE = "https://www.di.se";

const SKIP_PATH_RE =
  /^\/(?:konto|tag|prenumerera|erbjudande|kundservice|om-di|contact|search|video|podcast|nyhetsbrev|tipsa)/i;

function stripHtml(raw: string): string {
  return decodeXmlText(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isArticlePath(pathname: string): boolean {
  if (SKIP_PATH_RE.test(pathname)) return false;
  return /^\/(?:nyheter|live|bors|ekonomi|analys|digital|debatt|varlden|naringsliv|hallbart-naringsliv|ditv)\//i.test(
    pathname,
  );
}

async function fetchPublicHtml(url: string): Promise<{ ok: boolean; status: number; html: string; blocked: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FETCH_UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    const html = await res.text();
    const blocked = res.status === 401 || res.status === 403;
    return { ok: res.ok && html.length > 2000, status: res.status, html, blocked };
  } catch {
    return { ok: false, status: 0, html: "", blocked: false };
  }
}

function pushUnique(
  out: FrontPageCandidate[],
  seen: Set<string>,
  candidate: FrontPageCandidate,
): void {
  const key = normalizeUrl(candidate.url);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(candidate);
}

function extractDiJustNu(html: string, meta: Pick<FrontPageCandidate, "source" | "sourceLabel">): FrontPageCandidate[] {
  const out: FrontPageCandidate[] = [];
  const re =
    /<a[^>]*class="[^"]*js_right-now[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*class="[^"]*right-now__heading[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(html))) {
    const url = resolveUrl(m[1]!, DI_BASE);
    const title = stripHtml(m[2]!);
    if (!url || title.length < 12) continue;
    if (!isArticlePath(new URL(url).pathname)) continue;
    pos += 1;
    out.push({
      ...meta,
      title,
      url,
      publishedAt: null,
      snippet: null,
      frontPageTier: "breaking",
      modulePosition: pos,
      origin: "breaking",
    });
  }
  return out;
}

function extractDiTeasers(
  html: string,
  meta: Pick<FrontPageCandidate, "source" | "sourceLabel">,
  origin: HeadlineOrigin,
): FrontPageCandidate[] {
  const out: FrontPageCandidate[] = [];
  const re =
    /<article[^>]*class="([^"]*)"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let m: RegExpExecArray | null;
  let largeCount = 0;
  let modulePos = 0;

  while ((m = re.exec(html))) {
    const classes = m[1] ?? "";
    const url = resolveUrl(m[2]!, DI_BASE);
    const title = stripHtml(m[3]!);
    if (!url || title.length < 12) continue;
    if (!isArticlePath(new URL(url).pathname)) continue;
    if (/prenumerant|logga in|vinnare &amp; förlorare|vinnare & förlorare/i.test(title)) continue;

    if (classes.includes("right-now__teaser")) continue;

    let tier: FrontPageTier;
    if (classes.includes("teaser--large")) {
      largeCount += 1;
      tier = largeCount === 1 ? "main_lead" : "secondary_lead";
    } else if (classes.includes("js_market-news") || classes.includes("js_news-item")) {
      modulePos += 1;
      tier = modulePos <= 8 ? "top_module" : "lower_module";
    } else if (classes.includes("teaser--small") || classes.includes("teaser")) {
      modulePos += 1;
      tier = modulePos <= 8 ? "top_module" : "lower_module";
    } else {
      continue;
    }

    out.push({
      ...meta,
      title,
      url,
      publishedAt: null,
      snippet: null,
      frontPageTier: tier,
      modulePosition: tier === "main_lead" || tier === "secondary_lead" ? largeCount : modulePos,
      origin,
    });
  }
  return out;
}

async function fetchDiFrontPageCandidates(): Promise<{ candidates: FrontPageCandidate[]; status: FrontPageFetchStatus }> {
  const meta = { source: "Dagens Industri", sourceLabel: "DI" };
  const pages: Array<{ url: string; origin: HeadlineOrigin }> = [
    { url: `${DI_BASE}/`, origin: "front_page" },
    { url: `${DI_BASE}/nyheter/`, origin: "front_page" },
    { url: `${DI_BASE}/bors/`, origin: "markets_page" },
  ];

  const candidates: FrontPageCandidate[] = [];
  const seen = new Set<string>();
  const attempted: string[] = [];
  let anyOk = false;

  for (const page of pages) {
    attempted.push(page.url);
    const res = await fetchPublicHtml(page.url);
    if (!res.ok) continue;
    anyOk = true;

    for (const c of extractDiJustNu(res.html, meta)) {
      pushUnique(candidates, seen, c);
    }
    for (const c of extractDiTeasers(res.html, meta, page.origin)) {
      pushUnique(candidates, seen, c);
      if (candidates.length >= 30) break;
    }
  }

  const deduped: FrontPageCandidate[] = [];
  const urlSeen = new Set<string>();
  for (const c of candidates) {
    const key = normalizeUrl(c.url);
    if (urlSeen.has(key)) continue;
    urlSeen.add(key);
    deduped.push(c);
  }

  return {
    candidates: deduped.slice(0, 20),
    status: {
      sourceLabel: "DI",
      attempted,
      ok: anyOk,
      blocked: !anyOk,
      candidateCount: deduped.length,
      note: anyOk ? undefined : "DI front pages unreachable",
    },
  };
}

async function fetchBlockedSource(
  sourceLabel: string,
  urls: string[],
): Promise<{ candidates: FrontPageCandidate[]; status: FrontPageFetchStatus }> {
  const attempted = [...urls];
  let blocked = false;
  for (const url of urls) {
    const res = await fetchPublicHtml(url);
    if (res.blocked) blocked = true;
    if (res.ok && res.html.length > 5000) {
      // No reliable public headline selectors verified — RSS only for now.
      return {
        candidates: [],
        status: {
          sourceLabel,
          attempted,
          ok: false,
          blocked: false,
          candidateCount: 0,
          note: "HTML fetched but no safe headline extractor implemented",
        },
      };
    }
  }
  return {
    candidates: [],
    status: {
      sourceLabel,
      attempted,
      ok: false,
      blocked,
      candidateCount: 0,
      note: blocked ? "Server-side fetch blocked (401/403)" : "Front page unavailable",
    },
  };
}

export interface FrontPageFetchResult {
  candidates: FrontPageCandidate[];
  statuses: FrontPageFetchStatus[];
}

export async function fetchAllFrontPageCandidates(): Promise<FrontPageFetchResult> {
  const [di, bloomberg, ft, wsj] = await Promise.all([
    fetchDiFrontPageCandidates(),
    fetchBlockedSource("Bloomberg", [
      "https://www.bloomberg.com/markets",
      "https://www.bloomberg.com/latest",
    ]),
    fetchBlockedSource("FT", ["https://www.ft.com/", "https://www.ft.com/markets"]),
    fetchBlockedSource("WSJ", ["https://www.wsj.com/markets", "https://www.wsj.com/news/markets"]),
  ]);

  return {
    candidates: di.candidates,
    statuses: [di.status, bloomberg.status, ft.status, wsj.status],
  };
}

export function frontPageCandidateToRaw(c: FrontPageCandidate): RawHeadline {
  return {
    source: c.source,
    sourceLabel: c.sourceLabel,
    title: c.title,
    url: c.url,
    publishedAt: c.publishedAt,
    snippet: c.snippet,
    feedPosition: null,
    frontPageTier: c.frontPageTier,
    modulePosition: c.modulePosition,
    origins: [c.origin],
  };
}
