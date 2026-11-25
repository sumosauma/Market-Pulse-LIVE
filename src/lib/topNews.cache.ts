import { createSwrCache } from "@/lib/commodities/swrCache";
import { fetchRssFeed } from "./rss";
import {
  PER_SOURCE_FETCH,
  ageHoursFromPublishedAt,
  isRelaxedFreshnessDay,
  isWithinSoftCutoff,
  selectTopHeadlines,
  type HeadlineOrigin,
  type RawHeadline,
} from "./topNewsRanking";
import { fetchAllFrontPageCandidates, frontPageCandidateToRaw } from "./topNewsFrontPage";
import {
  TOP_NEWS_CACHE_MS,
  type TopNewsHeadline,
  type TopNewsPayload,
} from "./topNews.types";

export type { TopNewsHeadline, TopNewsPayload };
export { TOP_NEWS_CACHE_MS };

const CACHE_MS = TOP_NEWS_CACHE_MS;
const TOP_NEWS_DISK_PATH = "data/cache/top-news.json";
const TOP_NEWS_CACHE_VERSION = 1;

const SOURCES = [
  {
    feedUrl: "https://www.di.se/rss",
    source: "Dagens Industri",
    sourceLabel: "DI",
  },
  {
    feedUrl: "https://feeds.bloomberg.com/markets/news.rss",
    source: "Bloomberg",
    sourceLabel: "Bloomberg",
  },
  {
    feedUrl: "https://www.ft.com/markets?format=rss",
    fallbackFeedUrl: "https://www.ft.com/rss/home",
    source: "Financial Times",
    sourceLabel: "FT",
  },
  {
    feedUrl: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
    source: "Wall Street Journal",
    sourceLabel: "WSJ",
  },
] as const;

function payloadIsFresh(payload: TopNewsPayload, nowMs: number): boolean {
  if (payload.headlines.length === 0) return false;
  const relaxedDay = isRelaxedFreshnessDay(new Date(nowMs));
  return payload.headlines.every((h) =>
    isWithinSoftCutoff(ageHoursFromPublishedAt(h.publishedAt, nowMs), relaxedDay),
  );
}

function usableTopNews(payload: TopNewsPayload | null | undefined): payload is TopNewsPayload {
  return Boolean(payload && payload.headlines.length > 0 && typeof payload.fetchedAt === "string");
}

function toPublicHeadline(h: RawHeadline): TopNewsHeadline {
  return {
    source: h.source,
    sourceLabel: h.sourceLabel,
    title: h.title,
    url: h.url,
    publishedAt: h.publishedAt,
    snippet: h.snippet,
  };
}

async function loadTopNews(): Promise<TopNewsPayload> {
  const errors: Record<string, string> = {};
  const candidates: RawHeadline[] = [];
  const rssCountBySource: Record<string, number> = {};
  const frontPageCountBySource: Record<string, number> = {};

  try {
    await Promise.all(
      SOURCES.map(async (entry) => {
      const { feedUrl, source, sourceLabel } = entry;
      const fallbackFeedUrl = "fallbackFeedUrl" in entry ? entry.fallbackFeedUrl : undefined;

      let result = await fetchRssFeed(feedUrl, PER_SOURCE_FETCH);
      let usedUrl: string = feedUrl;

      if (!result.ok && fallbackFeedUrl) {
        console.warn(
          `[top-news] ${sourceLabel} primary feed failed: ${result.error} (${feedUrl}) — trying fallback`,
        );
        result = await fetchRssFeed(fallbackFeedUrl, PER_SOURCE_FETCH);
        usedUrl = fallbackFeedUrl;
      }

      if (!result.ok) {
        errors[sourceLabel] = `${result.error} (${usedUrl})`;
        console.warn(`[top-news] ${sourceLabel} RSS feed failed: ${errors[sourceLabel]}`);
        rssCountBySource[sourceLabel] = 0;
        return;
      }

      rssCountBySource[sourceLabel] = result.items.length;
      for (const item of result.items) {
        candidates.push({
          source,
          sourceLabel,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          snippet: item.snippet,
          feedPosition: item.feedPosition,
          frontPageTier: null,
          modulePosition: null,
          origins: ["rss"] as HeadlineOrigin[],
        });
      }
      }),
    );

    let frontPageResult: Awaited<ReturnType<typeof fetchAllFrontPageCandidates>>;
    try {
      frontPageResult = await fetchAllFrontPageCandidates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Front-page fetch failed";
      console.warn(`[top-news] front-page fetch error: ${msg}`);
      frontPageResult = { candidates: [], statuses: [] };
      errors["front-page"] = msg;
    }

    for (const status of frontPageResult.statuses) {
    if (status.blocked) {
      console.info(
        `[top-news] ${status.sourceLabel} front-page skipped (blocked): ${status.note ?? status.attempted.join(", ")}`,
      );
    } else if (!status.ok && status.candidateCount === 0) {
      console.info(`[top-news] ${status.sourceLabel} front-page unavailable: ${status.note ?? "no candidates"}`);
    } else if (status.ok) {
      console.info(
        `[top-news] ${status.sourceLabel} front-page OK: ${status.candidateCount} candidates from ${status.attempted.length} page(s)`,
      );
    }
    frontPageCountBySource[status.sourceLabel] = status.candidateCount;
    }

    for (const fp of frontPageResult.candidates) {
      candidates.push(frontPageCandidateToRaw(fp));
    }

    console.info("[top-news] candidate counts:", {
      rss: rssCountBySource,
      frontPage: frontPageCountBySource,
      totalRaw: candidates.length,
    });

    const nowMs = Date.now();
    const { headlines, debug, stats, fallbackTierUsed, warning } = selectTopHeadlines(
      candidates,
      nowMs,
      {
        rssCountBySource,
        frontPageCountBySource,
      },
    );

    if (warning) console.warn(warning);

    if (debug.length > 0) {
      console.info("[top-news] selected market headlines:");
      for (const h of debug) {
        console.info({
          title: h.title.slice(0, 120),
          source: h.sourceLabel,
          origin: h.origins.join("+"),
          publishedAt: h.publishedAt,
          ageHours: h.ageHours !== null ? Math.round(h.ageHours * 10) / 10 : null,
          finalScore: Math.round(h.score * 10) / 10,
          editorialPriorityScore: h.editorialPriorityScore,
          recencyScore: h.recencyScore,
          marketKeywordScore: h.marketKeywordScore,
          crossSourceBoost: h.crossSourceBoost,
          persistenceBoost: h.persistenceBoost,
          stalePenalty: h.stalePenalty,
          freshnessTier: h.freshnessTier,
          selectionTier: h.selectionTier,
          fallbackTierUsed,
          whySelected: h.selectionReason,
          url: h.url,
        });
      }
      console.info("[top-news] selection stats:", { ...stats, fallbackTierUsed, count: debug.length });
    }

    return {
      headlines: headlines.map(toPublicHeadline),
      errors,
      fetchedAt: new Date().toISOString(),
      fromStaleCache: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Top news load failed";
    console.error("[top-news] loadTopNews failed:", err);
    return {
      headlines: [],
      errors: { load: msg },
      fetchedAt: new Date().toISOString(),
      fromStaleCache: false,
    };
  }
}

const topNewsSwr = createSwrCache<TopNewsPayload>({
  cacheMs: CACHE_MS,
  version: TOP_NEWS_CACHE_VERSION,
  diskPath: TOP_NEWS_DISK_PATH,
  usable: usableTopNews,
  loadLive: loadTopNews,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
  // Avoid persisting empty / over-age headline sets as a "good" cache.
  shouldPersist: (payload) => usableTopNews(payload) && payloadIsFresh(payload, Date.now()),
  returnUnpersistedLive: true,
});

export function getCachedTopNews(): Promise<TopNewsPayload> {
  return topNewsSwr.load();
}

/** Direct loader for audits (bypasses createServerFn RPC wrapper). */
export function loadTopNewsForAudit(): Promise<TopNewsPayload> {
  return topNewsSwr.load();
}

/** Audit / test helper — clears process memory so disk age can be exercised. */
export function clearTopNewsSwrMemoryForAudit(): void {
  topNewsSwr.clearMemory();
}
