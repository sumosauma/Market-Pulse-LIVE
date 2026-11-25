import { createServerFn } from "@tanstack/react-start";
import type { SectorPerformance } from "./sectorPerformance";

export const SECTOR_PERFORMANCE_QUERY_KEY = ["commodities-sector-performance", "v2"] as const;

export const getSectorPerformance = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorPerformance> => {
    const { getCachedSectorPerformance } = await import("./sectorPerformance.cache");
    return getCachedSectorPerformance();
  },
);
