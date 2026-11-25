import { createServerFn } from "@tanstack/react-start";
import type { CommodityOverview } from "./overview";

export const COMMODITIES_OVERVIEW_QUERY_KEY = ["commodities-overview", "v10"] as const;

export const getCommodityOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityOverview> => {
    const { getCachedCommodityOverview } = await import("./overview.cache");
    return getCachedCommodityOverview();
  },
);
