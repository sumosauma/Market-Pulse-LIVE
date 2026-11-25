export interface TopNewsHeadline {
  source: string;
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string | null;
}

export interface TopNewsPayload {
  headlines: TopNewsHeadline[];
  errors: Record<string, string>;
  fetchedAt: string;
  /** True when serving an expired SWR snapshot while a background refresh runs. */
  fromStaleCache?: boolean;
}

/** 8 minutes — keep in sync with client staleTime. */
export const TOP_NEWS_CACHE_MS = 8 * 60 * 1000;
