import { createServerFn } from "@tanstack/react-start";
import type { CommodityIndicators } from "./indicators";

export const COMMODITY_INDICATORS_QUERY_KEY = ["commodities-indicators", "v13"] as const;

export const getCommodityIndicators = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityIndicators> => {
    const { getCachedCommodityIndicators } = await import("./indicators.cache");
    return getCachedCommodityIndicators();
  },
);
