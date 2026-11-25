import { createServerFn } from "@tanstack/react-start";
import type { FuturesTermStructure } from "./futuresCurve";

export const FUTURES_CURVE_QUERY_KEY = ["commodities-futures-curve", "v14"] as const;

export const getFuturesTermStructure = createServerFn({ method: "GET" }).handler(
  async (): Promise<FuturesTermStructure> => {
    const { getCachedFuturesTermStructure } = await import("./futuresCurve.cache");
    return getCachedFuturesTermStructure();
  },
);
