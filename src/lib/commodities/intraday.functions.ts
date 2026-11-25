import { createServerFn } from "@tanstack/react-start";
import type { CommodityIntradayPayload } from "./intraday";

export const COMMODITY_INTRADAY_QUERY_KEY = ["commodities-intraday", "v1"] as const;

export const getCommodityIntraday = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityIntradayPayload> => {
    const { getCachedCommodityIntraday } = await import("./intraday.cache");
    return getCachedCommodityIntraday();
  },
);
