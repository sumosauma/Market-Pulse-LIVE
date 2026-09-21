import type { Quote } from "@/lib/markets.functions";
import { formatQuoteSourceDisplay } from "@/lib/markets/quoteMeta";

export function QuoteSourceMeta({ q }: { q: Quote }) {
  const text = formatQuoteSourceDisplay(q);
  if (!text) return null;
  const title = q.fromStaleCache && q.error ? `${text} — ${q.error}` : q.error ?? text;
  return (
    <div
      className="mt-0.5 truncate text-[9px] font-medium tracking-wide text-foreground/50"
      title={title}
    >
      {text}
    </div>
  );
}
