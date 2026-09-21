import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MarketVolatilityCards } from "@/components/derivatives/MarketVolatilityCards";
import { VolIndexCards } from "@/components/derivatives/VolIndexCards";
import { VolTermStructureChart } from "@/components/derivatives/VolTermStructureChart";
import { PageShell, Panel } from "@/components/PageShell";
import {
  DERIVATIVES_VOL_QUERY_KEY,
  getMarketVolatility,
} from "@/lib/derivatives/derivatives.functions";
import { getVolIndices, VOL_INDICES_QUERY_KEY } from "@/lib/derivatives/volIndices.functions";
import {
  getVolTermStructure,
  VOL_TERM_QUERY_KEY,
} from "@/lib/derivatives/volTermStructure.functions";

const VOL_STALE_MS = 15 * 60 * 1000;

export const Route = createFileRoute("/derivatives")({
  head: () => ({
    meta: [
      { title: "Volatility — Market Pulse AI" },
      { name: "description", content: "Equity derivatives volatility: listed index options, cash vol indices, and realized vs implied." },
    ],
  }),
  component: DerivativesPage,
});

function DerivativesPage() {
  const fetchVol = useServerFn(getMarketVolatility);
  const fetchVolIndices = useServerFn(getVolIndices);
  const fetchVolTerm = useServerFn(getVolTermStructure);
  const query = useQuery({
    queryKey: DERIVATIVES_VOL_QUERY_KEY,
    queryFn: () => fetchVol(),
    staleTime: VOL_STALE_MS,
  });
  const volIndexQuery = useQuery({
    queryKey: VOL_INDICES_QUERY_KEY,
    queryFn: () => fetchVolIndices(),
    staleTime: VOL_STALE_MS,
    refetchOnMount: "always",
  });
  const volTermQuery = useQuery({
    queryKey: VOL_TERM_QUERY_KEY,
    queryFn: () => fetchVolTerm(),
    staleTime: VOL_STALE_MS,
  });

  const error = query.isError
    ? query.error instanceof Error
      ? query.error.message
      : "Could not load market volatility"
    : null;

  return (
    <PageShell
      title="Volatility"
      subtitle="Based on equity derivatives: listed index options, cash volatility indices, and realized versus implied volatility."
    >
      <div className="space-y-4">
        <Panel title="Volatility indices">
          <div className="p-4">
            <VolIndexCards
              rows={volIndexQuery.data?.rows ?? []}
              isLoading={volIndexQuery.isPending && !volIndexQuery.data}
              dayMove={volIndexQuery.data?.spxVixDayMove ?? null}
              vstoxxDayMove={volIndexQuery.data?.sx5eVstoxxDayMove ?? null}
              skew={volIndexQuery.data?.skew ?? null}
            />
          </div>
        </Panel>

        <Panel title="Market Volatility">
          <div className="p-4">
            {error && !query.data ? (
              <p className="text-[12px] text-muted-foreground">{error}</p>
            ) : (
              <MarketVolatilityCards
                rows={query.data?.rows ?? []}
                isLoading={query.isPending && !query.data}
              />
            )}
          </div>
        </Panel>

        <Panel title="Implied Volatility Term Structure">
          <VolTermStructureChart
            payload={volTermQuery.data}
            isLoading={volTermQuery.isPending && !volTermQuery.data}
          />
        </Panel>
      </div>
    </PageShell>
  );
}
