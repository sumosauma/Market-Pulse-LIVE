import { useState, useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import { fmtChangePct } from "@/lib/equities/equityMarketsUi";
import { mapPctColor } from "@/lib/equities/equityMapStyle";
import {
  classifyRotation,
  rotationSnapshot,
  rowsForPeriod,
  SECTOR_PERIODS,
  type SectorPeriodId,
} from "@/lib/equities/usSectorRotation";
import { SECTOR_MARKETS, type SectorMarketId } from "@/lib/equities/sectorRotationMarkets";
import { useSectorRotation } from "@/lib/equities/useUsSectorRotation";

const CARD = "rounded-xl bg-secondary/35 px-4 py-3.5 ring-1 ring-border/40";
const CARD_HEADING = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const STAT = "font-mono text-[17px] font-semibold tabular-nums tracking-tight leading-none";

function heatBackground(relative: number | null): string | undefined {
  if (relative == null || !Number.isFinite(relative) || Math.abs(relative) < 0.05) return undefined;
  const strength = Math.min(Math.abs(relative) / 4, 1);
  const alpha = (0.07 + strength * 0.16).toFixed(3);
  return relative > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
}

function CardInfo({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
        >
          <Info className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        className={[
          "border border-border bg-card px-2.5 py-2 text-left text-[11px] font-normal leading-relaxed text-foreground shadow-md",
          wide ? "max-w-[340px]" : "max-w-[260px]",
        ].join(" ")}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function SnapshotCard({
  title,
  hint,
  loading,
  children,
}: {
  title: string;
  hint?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <div className={CARD_HEADING}>{title}</div>
        {hint}
      </div>
      <div className="mt-2 min-h-12">
        {loading ? (
          <div className="flex min-h-12 items-center">
            <YieldCurveFetchSpinner label="Loading sector rotation" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function UsSectorRotation() {
  const [market, setMarket] = useState<SectorMarketId>("US");
  const [period, setPeriod] = useState<SectorPeriodId>("1M");
  const config = SECTOR_MARKETS[market];
  const usQuery = useSectorRotation("US", true);
  const seQuery = useSectorRotation("SE", market === "SE");
  const query = market === "US" ? usQuery : seQuery;
  const dataReady = query.data?.market === market;
  const loading = !dataReady && (query.isPending || query.isFetching);
  const failed = query.isError && !dataReady;
  const benchmarkName = config.benchmarkName;

  const view = useMemo(() => {
    if (!query.data || query.data.market !== market) return null;
    const rows = rowsForPeriod(query.data, period);
    return {
      rows,
      snapshot: rotationSnapshot(rows),
      regime: classifyRotation(rows),
    };
  }, [query.data, period, market]);

  return (
    <section className="overflow-hidden rounded-xl bg-card/40 ring-1 ring-border/50">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
            Sector Rotation
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{config.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {query.isFetching && query.data ? <YieldCurveFetchSpinner label="Loading sector rotation" /> : null}
          <div className="flex items-center gap-0.5" role="group" aria-label="Sector market">
            {(["US", "SE"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={market === id}
                onClick={() => setMarket(id)}
                className={[
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  market === id
                    ? "bg-muted/50 text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
                ].join(" ")}
              >
                {SECTOR_MARKETS[id].toggleLabel}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5" role="group" aria-label="Sector return period">
            {SECTOR_PERIODS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={period === id}
                onClick={() => setPeriod(id)}
                className={[
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  period === id
                    ? "bg-muted/50 text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
                ].join(" ")}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </header>

      {failed ? (
        <p className="px-4 pb-4 text-[12px] text-muted-foreground">
          {market === "SE" ? "Swedish" : "US"} sector data unavailable.
        </p>
      ) : (
        <div className="grid gap-3 px-3 pb-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.7fr)]">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Sector</th>
                  <th className="px-2 py-2 text-right font-semibold">Return</th>
                  <th className="px-2 py-2 text-right font-semibold">{config.benchmarkColumn}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-16">
                      <div className="flex justify-center">
                        <YieldCurveFetchSpinner label="Loading sector rotation" />
                      </div>
                    </td>
                  </tr>
                ) : (
                  view?.rows.map((row) => (
                    <tr key={row.symbol} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-2">
                        <div className="text-[13px] font-medium text-foreground">{row.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{row.symbol}</div>
                      </td>
                      <td
                        className="px-2 py-2 text-right font-mono text-[13px] font-semibold tabular-nums"
                        style={{ color: mapPctColor(row.absolute) }}
                      >
                        {fmtChangePct(row.absolute)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className="inline-block min-w-[4.5rem] rounded-md px-2 py-1 font-mono text-[13px] font-semibold tabular-nums"
                          style={{
                            color: mapPctColor(row.relative),
                            backgroundColor: heatBackground(row.relative),
                          }}
                        >
                          {fmtChangePct(row.relative)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <SnapshotCard
              title="Leading sector"
              loading={loading}
              hint={
                <CardInfo label={`The sector with the strongest relative performance versus the ${benchmarkName} over the selected period.`}>
                  The sector with the strongest relative performance versus the {benchmarkName} over the selected period.
                </CardInfo>
              }
            >
              <div className="text-[14px] font-semibold text-foreground">
                {view?.snapshot.leading?.name ?? "—"}
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                <span className={STAT} style={{ color: mapPctColor(view?.snapshot.leading?.relative ?? null) }}>
                  {view?.snapshot.leading ? fmtChangePct(view.snapshot.leading.relative) : "—"}
                </span>
                {view?.snapshot.leading ? ` vs ${benchmarkName} · ${period}` : null}
              </p>
            </SnapshotCard>

            <SnapshotCard
              title="Lagging sector"
              loading={loading}
              hint={
                <CardInfo label={`The sector with the weakest relative performance versus the ${benchmarkName} over the selected period.`}>
                  The sector with the weakest relative performance versus the {benchmarkName} over the selected period.
                </CardInfo>
              }
            >
              <div className="text-[14px] font-semibold text-foreground">
                {view?.snapshot.lagging?.name ?? "—"}
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                <span className={STAT} style={{ color: mapPctColor(view?.snapshot.lagging?.relative ?? null) }}>
                  {view?.snapshot.lagging ? fmtChangePct(view.snapshot.lagging.relative) : "—"}
                </span>
                {view?.snapshot.lagging ? ` vs ${benchmarkName} · ${period}` : null}
              </p>
            </SnapshotCard>

            <SnapshotCard
              title="Cyclicals vs defensives"
              loading={loading}
              hint={
                <CardInfo
                  wide
                  label="Compares the average return of cyclical sectors with defensive sectors over the selected period. Cyclicals: Technology, Financials, Industrials, Materials, Consumer Discretionary, Communication Services. Defensives: Health Care, Consumer Staples, Utilities. Positive means cyclicals are outperforming. Energy and Real Estate are excluded."
                >
                  <p>Compares the average return of cyclical sectors with defensive sectors over the selected period.</p>
                  <div className="mt-1.5 space-y-0.5">
                    <p><span className="font-semibold">Cyclicals:</span> Technology, Financials, Industrials, Materials, Consumer Discretionary, Communication Services</p>
                    <p><span className="font-semibold">Defensives:</span> Health Care, Consumer Staples, Utilities</p>
                  </div>
                  <p className="mt-1.5">Positive means cyclicals are outperforming.</p>
                  <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                    Energy and Real Estate are excluded.
                  </p>
                </CardInfo>
              }
            >
              <div
                className="font-mono text-[13px] font-semibold tabular-nums leading-snug"
                style={{ color: mapPctColor(view?.snapshot.spread ?? null) }}
              >
                {view?.snapshot.spread != null
                  ? `Cyclicals ${fmtChangePct(view.snapshot.spread)} vs Defensives`
                  : "—"}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Average {period} return. Energy and real estate excluded.
              </p>
            </SnapshotCard>

            <SnapshotCard
              title="Rotation regime"
              loading={loading}
              hint={
                <CardInfo
                  wide
                  label={`Groups sectors into four market themes based on relative performance vs the ${benchmarkName}. Growth: Technology, Consumer Discretionary, Communication Services. Cyclical: Financials, Industrials, Materials. Defensive: Consumer Staples, Health Care, Utilities. Commodity: Energy, Materials. The regime reflects which group shows the strongest broad relative leadership. If no group clearly dominates, it is classified as Mixed / No Clear Rotation. This is based on price performance, not fund-flow data.`}
                >
                  <p>Groups sectors into four market themes based on relative performance vs the {benchmarkName}:</p>
                  <div className="mt-1.5 space-y-0.5">
                    <p><span className="font-semibold">Growth:</span> Technology, Consumer Discretionary, Communication Services</p>
                    <p><span className="font-semibold">Cyclical:</span> Financials, Industrials, Materials</p>
                    <p><span className="font-semibold">Defensive:</span> Consumer Staples, Health Care, Utilities</p>
                    <p><span className="font-semibold">Commodity:</span> Energy, Materials</p>
                  </div>
                  <p className="mt-1.5">
                    The regime reflects which group shows the strongest broad relative leadership. If no group clearly dominates, it is classified as Mixed / No Clear Rotation.
                  </p>
                  <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                    This is based on price performance, not fund-flow data.
                  </p>
                </CardInfo>
              }
            >
              <div className="text-[14px] font-semibold text-foreground">{view?.regime.label ?? "—"}</div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{view?.regime.detail}</p>
            </SnapshotCard>
          </div>
          </TooltipProvider>
        </div>
      )}
    </section>
  );
}
