import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFxDeskMarket, getFxPositioning, getFxYieldHistory } from "./fxDesk.functions";

export function useFxDeskMarket() {
  const fetchMarket = useServerFn(getFxDeskMarket);
  return useQuery({
    queryKey: ["fx-desk-market", "v1"],
    queryFn: () => fetchMarket(),
    staleTime: 15 * 60 * 1000,
  });
}

export function useFxYieldHistory() {
  const fetchYields = useServerFn(getFxYieldHistory);
  return useQuery({
    queryKey: ["fx-yield-history", "v1"],
    queryFn: () => fetchYields(),
    staleTime: 30 * 60 * 1000,
  });
}

export function useFxPositioning() {
  const fetchCot = useServerFn(getFxPositioning);
  return useQuery({
    queryKey: ["fx-cftc-positioning", "v1"],
    queryFn: () => fetchCot(),
    staleTime: 12 * 60 * 60 * 1000,
  });
}
