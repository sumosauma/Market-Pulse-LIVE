import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEquityMarkets } from "@/lib/equities/equityMarkets.functions";
import { mergeEquityRows, computeEquitySummary } from "@/lib/equities/equityMarketsUi";
import type { EquityMarketsPayload } from "@/lib/equities/types";

const QUERY_TIMEOUT_MS = 30_000;

const EMPTY_PAYLOAD: EquityMarketsPayload = {
  quotes: [],
  fetchedAt: "",
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Equity markets fetch timeout")), ms);
    }),
  ]);
}

export function useEquityMarkets() {
  const fetchEquityMarkets = useServerFn(getEquityMarkets);

  const query = useQuery({
    queryKey: ["equity-markets"],
    queryFn: async (): Promise<EquityMarketsPayload> => {
      try {
        const result = await withTimeout(fetchEquityMarkets(), QUERY_TIMEOUT_MS);
        return result ?? EMPTY_PAYLOAD;
      } catch {
        return { ...EMPTY_PAYLOAD, fetchedAt: new Date().toISOString() };
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const rows = mergeEquityRows(query.data);
  const summary = computeEquitySummary(rows);

  return { query, rows, summary, fetchedAt: query.data?.fetchedAt || null };
}
