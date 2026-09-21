import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarkets, MARKETS_QUERY_KEY } from "@/lib/markets.functions";
import { analyzeMarkets } from "@/lib/analysis.functions";
import { AnalysisBriefing } from "@/components/AnalysisBriefing";
import { PageShell, Panel } from "@/components/PageShell";

export const Route = createFileRoute("/morning-brief")({
  head: () => ({
    meta: [
      { title: "Morning Brief — Market Pulse AI" },
      {
        name: "description",
        content:
          "Institutional cross-asset morning briefing — rates, equities, FX, commodities and volatility.",
      },
    ],
  }),
  component: MorningBriefPage,
});

function MorningBriefPage() {
  const fetchMarkets = useServerFn(getMarkets);
  const analyzeFn = useServerFn(analyzeMarkets);
  const { data } = useQuery({
    queryKey: MARKETS_QUERY_KEY,
    queryFn: () => fetchMarkets(),
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });
  const analysis = useMutation({
    mutationFn: () => analyzeFn({ data: { quotes: data?.quotes ?? [] } }),
  });

  return (
    <PageShell
      title="Morning Brief"
      subtitle="Sell-side style cross-asset note · generated on demand"
      actions={
        <button
          onClick={() => analysis.mutate()}
          disabled={analysis.isPending || !data?.quotes?.length}
          className="rounded-sm border border-primary/30 bg-primary px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {analysis.isPending
            ? "Generating…"
            : analysis.data?.analysis
              ? "Re-run"
              : "Generate brief"}
        </button>
      }
    >
      <Panel title="Cross-asset narrative" meta="AI-assisted · institutional">
        <div className="p-4">
          {analysis.data?.error && (
            <div className="mb-3 rounded-sm border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
              {analysis.data.error}
            </div>
          )}
          {analysis.data?.analysis ? (
            <AnalysisBriefing
              markdown={analysis.data.analysis}
              quotes={data?.quotes ?? []}
            />
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Generate the morning brief to produce a structured note covering
              Market Snapshot, Cross-Asset Read, Nordic Implications and What
              To Watch.
            </p>
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
