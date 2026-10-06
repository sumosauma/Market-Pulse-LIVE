import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { SectorMarketId } from "./sectorRotationMarkets";
import { getSectorRotation } from "./usSectorRotation.functions";

const STALE_MS = 5 * 60 * 1000;

export function useSectorRotation(market: SectorMarketId, enabled: boolean) {
  const fetchRotation = useServerFn(getSectorRotation);
  return useQuery({
    queryKey: ["sector-rotation", market],
    queryFn: () => fetchRotation({ data: market }),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: enabled ? STALE_MS : false,
    refetchOnWindowFocus: false,
  });
}
