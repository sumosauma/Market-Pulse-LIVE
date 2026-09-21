import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { PercentileScale } from "@/components/derivatives/PercentileScale";
import { formatVolPct, formatVrp, vrpToneClass } from "@/lib/derivatives/format";
import { DERIVATIVES_MARKETS } from "@/lib/derivatives/markets";
import type { MarketVolRow, VolMetric } from "@/lib/derivatives/types";

const CARD =
  "rounded-md border border-border bg-card/80 px-4 py-3.5 shadow-[0_1px_0_0_rgba(15,23,42,0.03)]";

function MetricRow({
  label,
  hint,
  value,
  valueClass,
  pending,
  metric,
}: {
  label: string;
  hint: string;
  value: string;
  valueClass?: string;
  pending: boolean;
  metric: VolMetric | null;
}) {
  const reason = !pending && metric && metric.value == null ? metric.unavailableReason : null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[14px] font-semibold tracking-tight text-foreground">
          {label}
        </h4>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
        {reason ? (
          <p className="mt-1 text-[10px] leading-snug text-amber-700 dark:text-amber-400">{reason}</p>
        ) : null}
      </div>
      <div
        className={[
          "shrink-0 max-w-[48%] text-right font-mono text-[17px] font-semibold tabular-nums tracking-tight leading-tight",
          pending ? "text-muted-foreground" : (valueClass ?? "text-foreground"),
        ].join(" ")}
      >
        {pending ? "…" : value}
      </div>
    </div>
  );
}

function MarketCard({ row, pending }: { row: MarketVolRow | null; pending: boolean }) {
  const label = row?.label ?? "—";
  const countryId = row?.countryId ?? "";
  return (
    <article className={CARD}>
      <header className="mb-3 flex items-center gap-2.5 border-b border-border/70 pb-2.5">
        {countryId ? <EquityCountryFlag countryId={countryId} size="md" /> : null}
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{label}</h3>
      </header>
      <div className="space-y-3">
        <div className="space-y-2">
          <MetricRow
            label="20-day realized volatility"
            hint="Log-return standard deviation, annualized with √252"
            value={formatVolPct(row?.rv20.value ?? null)}
            pending={pending}
            metric={row?.rv20 ?? null}
          />
          <PercentileScale
            percentile={row?.rv20.percentile1y ?? null}
            pending={pending}
            compact
          />
        </div>
        <MetricRow
          label="20-day implied volatility"
          hint="At-the-money listed options, constant-maturity 20 trading days"
          value={formatVolPct(row?.iv20.value ?? null)}
          pending={pending}
          metric={row?.iv20 ?? null}
        />
        <MetricRow
          label="Volatility risk premium"
          hint="20-day implied volatility minus 20-day realized volatility"
          value={formatVrp(row?.vrp.value ?? null)}
          valueClass={vrpToneClass(row?.vrp.value ?? null)}
          pending={pending}
          metric={row?.vrp ?? null}
        />
      </div>
    </article>
  );
}

export function MarketVolatilityCards({
  rows,
  isLoading,
}: {
  rows: readonly MarketVolRow[];
  isLoading: boolean;
}) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {DERIVATIVES_MARKETS.map((market) => {
        const row = byId.get(market.id) ?? null;
        const pending = isLoading && !row;
        return (
          <MarketCard
            key={market.id}
            row={
              row ?? {
                id: market.id,
                label: market.label,
                countryId: market.countryId,
                rv20: { value: null, asOf: null, sourceLabel: null, unavailableReason: null },
                iv20: { value: null, asOf: null, sourceLabel: null, unavailableReason: null },
                vrp: { value: null, asOf: null, sourceLabel: null, unavailableReason: null },
              }
            }
            pending={pending}
          />
        );
      })}
    </div>
  );
}
