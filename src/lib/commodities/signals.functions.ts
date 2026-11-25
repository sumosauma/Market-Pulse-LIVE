import { createServerFn } from "@tanstack/react-start";
import type { CommoditySignalsPayload } from "./signals";

export const COMMODITY_SIGNALS_QUERY_KEY = ["commodities-signals", "v14"] as const;

export const getCommoditySignals = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommoditySignalsPayload> => {
    const { getCachedCommoditySignals } = await import("./signals.cache");
    return getCachedCommoditySignals();
  },
);
