import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarkets, MARKETS_QUERY_KEY } from "@/lib/markets.functions";
import { PageShell } from "@/components/PageShell";
import { WatchlistMarketCard } from "@/components/watchlist/WatchlistMarketCard";
import {
  groupWatchlistQuotes,
  WATCHLIST_SECTIONS,
} from "@/lib/watchlist/groupWatchlistQuotes";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Market Monitor — Market Pulse AI" },
      { name: "description", content: "Cross-asset market monitor with 5-day charts." },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const fetchMarkets = useServerFn(getMarkets);
  const { data, isLoading } = useQuery({
    queryKey: MARKETS_QUERY_KEY,
    queryFn: () => fetchMarkets(),
    refetchInterval: 60_000,
    staleTime: 0,
  });
  const quotes = data?.quotes ?? [];
  const grouped = useMemo(() => groupWatchlistQuotes(quotes), [quotes]);

  return (
    <PageShell
      title="Market Monitor"
      subtitle="Cross-asset · daily and 5-day performance"
    >
      {isLoading ? (
        <div className="text-[12px] font-medium text-foreground/70">Loading market data…</div>
      ) : (
        <div className="space-y-6">
          <p className="text-[10.5px] font-mono font-medium uppercase tracking-wider text-foreground/60">
            {quotes.length} instruments · grouped by category
          </p>
          {WATCHLIST_SECTIONS.map(({ id, title }) => {
            const items = grouped.get(id);
            if (!items?.length) return null;
            return (
              <section key={id} className="@container">
                <header className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="flex min-w-0 items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground">
                    <span className="h-2.5 w-[3px] shrink-0 rounded-full bg-primary/80" aria-hidden />
                    <span className="truncate">{title}</span>
                  </h2>
                  <span className="shrink-0 text-[10.5px] font-mono font-medium uppercase tracking-wider text-foreground/60">
                    {items.length} · 5D
                  </span>
                </header>
                <div className="grid grid-cols-2 gap-2 @max-[440px]:grid-cols-1 @lg:grid-cols-3 @xl:grid-cols-4 [&>*]:min-w-0">
                  {items.map((q) => (
                    <WatchlistMarketCard key={q.symbol} q={q} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
