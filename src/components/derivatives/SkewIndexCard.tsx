import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { formatSignedPct, formatVolIndex } from "@/lib/derivatives/format";
import { SKEW_EXPLAINER, type SkewIndexRow } from "@/lib/derivatives/skewIndex";
import { PercentileScale } from "@/components/derivatives/PercentileScale";

const CARD =
  "rounded-md border border-border bg-card/80 px-4 py-3.5 shadow-[0_1px_0_0_rgba(15,23,42,0.03)]";

export function SkewIndexCard({ row, pending }: { row: SkewIndexRow | null; pending: boolean }) {
  return (
    <article className={CARD}>
      <header className="mb-3 flex items-center gap-2.5 border-b border-border/70 pb-2.5">
        <EquityCountryFlag countryId="US" size="md" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">SKEW</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">CBOE S&P 500 tail-risk pricing</p>
        </div>
      </header>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Last</div>
          <div
            className={[
              "mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight",
              pending ? "text-muted-foreground" : "text-foreground",
            ].join(" ")}
          >
            {pending ? "…" : formatVolIndex(row?.last ?? null)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Change</div>
          <div
            className={[
              "mt-1 font-mono text-[15px] font-semibold tabular-nums",
              pending ? "text-muted-foreground" : changePctClass(row?.changePct ?? null),
            ].join(" ")}
          >
            {pending ? "…" : formatSignedPct(row?.changePct ?? null)}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
        <PercentileScale
          percentile={row?.percentile1y}
          pending={pending}
          label="1Y Percentile"
          explainer={SKEW_EXPLAINER}
        />
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Tail-risk pricing
          </div>
          <div className="shrink-0 font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
            {pending ? "…" : (row?.tailRisk ?? "—")}
          </div>
        </div>
      </div>
    </article>
  );
}
