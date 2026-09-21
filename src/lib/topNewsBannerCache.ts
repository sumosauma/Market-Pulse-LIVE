import type { TopNewsHeadline } from "./topNews.functions";
import {
  ageHoursFromPublishedAt,
  isRelaxedFreshnessDay,
  isWithinSoftCutoff,
} from "./topNewsRanking";

const CACHE_KEY = "market-pulse-top-news-cache";

export interface CachedTopNews {
  headlines: TopNewsHeadline[];
  fetchedAt: string;
}

export function filterHeadlinesWithinSoftMax(
  headlines: TopNewsHeadline[],
  nowMs = Date.now(),
): TopNewsHeadline[] {
  const relaxedDay = isRelaxedFreshnessDay(new Date(nowMs));
  return headlines.filter((h) =>
    isWithinSoftCutoff(ageHoursFromPublishedAt(h.publishedAt, nowMs), relaxedDay),
  );
}

export function readCachedTopNews(options?: { freshOnly?: boolean }): CachedTopNews | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTopNews;
    if (!Array.isArray(parsed.headlines) || parsed.headlines.length === 0) return null;
    if (options?.freshOnly) {
      const fresh = filterHeadlinesWithinSoftMax(parsed.headlines);
      if (fresh.length === 0) return null;
      return { headlines: fresh, fetchedAt: parsed.fetchedAt };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedTopNews(headlines: TopNewsHeadline[], fetchedAt: string): void {
  if (typeof window === "undefined" || headlines.length === 0) return;
  const fresh = filterHeadlinesWithinSoftMax(headlines);
  if (fresh.length === 0) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ headlines: fresh, fetchedAt }));
  } catch {
    // ignore quota / private mode errors
  }
}

/** Offline fallback — may include older headlines saved before cutoff. */
export function readOfflineCachedTopNews(): CachedTopNews | null {
  return readCachedTopNews({ freshOnly: false });
}
