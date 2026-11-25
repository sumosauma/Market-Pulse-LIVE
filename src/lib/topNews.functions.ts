import { createServerFn } from "@tanstack/react-start";
import { TOP_NEWS_CACHE_MS, type TopNewsPayload } from "./topNews.types";

export { TOP_NEWS_CACHE_MS };
export type { TopNewsHeadline, TopNewsPayload } from "./topNews.types";

export const getTopNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<TopNewsPayload> => {
    const { getCachedTopNews } = await import("./topNews.cache");
    return getCachedTopNews();
  },
);
