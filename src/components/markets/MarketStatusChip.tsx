import type { Quote } from "@/lib/markets.functions";
import { normalizeMarketDate } from "@/lib/markets/quoteMeta";

export function isQuoteHistoryStale(q: Quote): boolean {
  if (!q.history?.length) return false;
  const last = normalizeMarketDate(q.history[q.history.length - 1].date);
  const days = (Date.now() - new Date(`${last}T12:00:00`).getTime()) / 86_400_000;
  return days > 5;
}

export function MarketStatusChip({ q, stale }: { q: Quote; stale: boolean }) {
  if (!q.error && !stale && !q.fromStaleCache) return null;
  return (
    <div className="shrink-0 pt-px">
      {q.fromStaleCache ? (
        <span
          title={q.error ?? "Showing last successful fetch from server cache"}
          className="inline-flex cursor-help rounded-sm bg-amber-500/15 px-1 py-px text-[9.5px] font-mono font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400"
        >
          cached
        </span>
      ) : q.error ? (
        <span
          title={q.error}
          className="inline-flex cursor-help rounded-sm bg-destructive/10 px-1 py-px text-[9.5px] font-mono font-medium uppercase tracking-wider text-destructive"
        >
          err
        </span>
      ) : (
        <span className="inline-flex rounded-sm bg-secondary px-1 py-px text-[9.5px] font-mono font-medium uppercase tracking-wider text-foreground/65">
          stale
        </span>
      )}
    </div>
  );
}
