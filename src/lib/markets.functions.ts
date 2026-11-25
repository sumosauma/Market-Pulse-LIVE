import { createServerFn } from "@tanstack/react-start";
import { MARKETS_QUERY_KEY } from "@/lib/markets/quoteMeta";
import { MARKETS_CACHE_MS, type MarketsPayload } from "@/lib/markets/types";

export { MARKETS_QUERY_KEY, MARKETS_CACHE_MS };
export type {
  HistoryPoint,
  MarketsPayload,
  Quote,
  QuoteDataKind,
} from "@/lib/markets/types";

export const getMarkets = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketsPayload> => {
    const { getCachedMarkets } = await import("./markets.cache");
    return getCachedMarkets();
  },
);
