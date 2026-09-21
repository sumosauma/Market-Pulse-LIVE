/**
 * Live freshness audit for Market Headlines banner.
 * Run: npx tsx scripts/verify-top-news-freshness.ts
 */

import { fetchRssFeed } from "../src/lib/rss";
import { fetchAllFrontPageCandidates, frontPageCandidateToRaw } from "../src/lib/topNewsFrontPage";
import {
  PER_SOURCE_FETCH,
  ageHoursFromPublishedAt,
  getFreshnessLimits,
  isRelaxedFreshnessDay,
  selectTopHeadlines,
  type HeadlineOrigin,
  type RawHeadline,
} from "../src/lib/topNewsRanking";

const SOURCES = [
  { feedUrl: "https://www.di.se/rss", source: "Dagens Industri", sourceLabel: "DI" },
  { feedUrl: "https://feeds.bloomberg.com/markets/news.rss", source: "Bloomberg", sourceLabel: "Bloomberg" },
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

async function main() {
  const nowMs = Date.now();
  const relaxedDay = isRelaxedFreshnessDay(new Date(nowMs));
  const limits = getFreshnessLimits(relaxedDay);
  const candidates: RawHeadline[] = [];
  const rssCountBySource: Record<string, number> = {};
  const frontPageCountBySource: Record<string, number> = {};

  await Promise.all(
    SOURCES.map(async (entry) => {
      const { feedUrl, source, sourceLabel } = entry;
      const fallbackFeedUrl = "fallbackFeedUrl" in entry ? entry.fallbackFeedUrl : undefined;
      let result = await fetchRssFeed(feedUrl, PER_SOURCE_FETCH);
      if (!result.ok && fallbackFeedUrl) {
        result = await fetchRssFeed(fallbackFeedUrl, PER_SOURCE_FETCH);
      }
      if (!result.ok) {
        rssCountBySource[sourceLabel] = 0;
        console.warn(`${sourceLabel} RSS failed: ${result.error}`);
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

  const frontPageResult = await fetchAllFrontPageCandidates();
  for (const status of frontPageResult.statuses) {
    frontPageCountBySource[status.sourceLabel] = status.candidateCount;
  }
  for (const fp of frontPageResult.candidates) {
    candidates.push(frontPageCandidateToRaw(fp));
  }

  const { debug, fallbackTierUsed, warning } = selectTopHeadlines(candidates, nowMs, {
    rssCountBySource,
    frontPageCountBySource,
  });

  console.log("\n=== Freshness limits ===");
  console.log({ relaxedDay, ...limits, fallbackTierUsed, warning: warning ?? null });

  console.log("\n=== Selected headlines ===");
  let stale72 = 0;
  for (const h of debug) {
    const age = h.ageHours !== null ? Math.round(h.ageHours * 10) / 10 : null;
    if (age !== null && age > 72) stale72++;
    console.log({
      title: h.title.slice(0, 90),
      source: h.sourceLabel,
      origin: h.origins.join("+"),
      ageHours: age,
      publishedAt: h.publishedAt,
      finalScore: Math.round(h.score),
      selectionTier: h.selectionTier,
      why: h.selectionReason,
    });
  }

  const maxAge = debug.reduce((m, h) => Math.max(m, h.ageHours ?? 0), 0);
  const over36 = debug.filter((h) => (h.ageHours ?? 0) > limits.softMax).length;
  const over72 = debug.filter((h) => (h.ageHours ?? 0) > 72).length;

  console.log("\n=== Summary ===");
  console.log({
    selected: debug.length,
    maxAgeHours: Math.round(maxAge * 10) / 10,
    overSoftMax: over36,
    over72h: over72,
    pass: over36 === 0 && stale72 === 0,
  });

  if (over36 > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
