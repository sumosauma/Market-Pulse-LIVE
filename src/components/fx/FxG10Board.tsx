import { useMemo } from "react";
import { Panel } from "@/components/PageShell";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import {
  FX_DESK_PERIODS,
  G10_CURRENCIES,
  g10CrossMatrix,
  type FxDeskPeriod,
  type G10CrossRow,
  type G10Currency,
} from "@/lib/fx/desk";
import { useFxDeskMarket } from "@/lib/fx/useFxDesk";
import { fmtPct } from "./fxFormat";
import { FxChips, FxInfo, FxSectionStatus } from "./FxSection";

const EMPTY_CELLS = Object.fromEntries(G10_CURRENCIES.map((currency) => [currency, null])) as Record<G10Currency, number | null>;

/** Opaque cell fill. Strength scales through typical G10 moves so 1% and 4% do not look alike. */
function matrixTone(pct: number | null): { background?: string; color?: string } {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return {};
  const spread = Math.pow(Math.min(Math.abs(pct) / 5.5, 1), 0.65);
  if (pct > 0) {
    return {
      background: `oklch(${(0.91 - spread * 0.28).toFixed(3)} ${(0.09 + spread * 0.11).toFixed(3)} 150)`,
      color: "#14532d",
    };
  }
  return {
    background: `oklch(${(0.92 - spread * 0.24).toFixed(3)} ${(0.08 + spread * 0.13).toFixed(3)} 25)`,
    color: "#7f1d1d",
  };
}

function placeholderRows(): G10CrossRow[] {
  return G10_CURRENCIES.map((currency) => ({
    currency,
    cells: EMPTY_CELLS,
    broad: null,
    rank: null,
  }));
}

export function FxG10Board({
  period,
  onPeriod,
}: {
  period: FxDeskPeriod;
  onPeriod: (period: FxDeskPeriod) => void;
}) {
  const query = useFxDeskMarket();
  const matrix = useMemo(
    () => (query.data ? g10CrossMatrix(query.data, period) : null),
    [query.data, period],
  );
  const loading = query.isPending && !query.data;
  const failed = (query.isError || !query.data) && !loading;
  const rows = matrix ?? placeholderRows();
  const ranked = matrix ? [...matrix].filter((row) => row.broad != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : [];
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          G10 Cross-Currency Heatmap
          <FxInfo
            wide
            label="Each cell shows the row currency’s return versus the column currency over the selected period. Green means the row currency strengthened; red means it weakened. Broad Strength is the average return of that currency versus the other nine G10 currencies."
          >
            <p>
              Each cell shows the row currency’s return versus the column currency over the selected period. Green means the row currency strengthened; red means it weakened.
            </p>
            <p className="mt-1.5 text-muted-foreground">
              Broad Strength is the average return of that currency versus the other nine G10 currencies.
            </p>
          </FxInfo>
        </span>
      }
      meta="Relative performance across major G10 currencies"
      actions={<FxChips options={FX_DESK_PERIODS} value={period} onChange={onPeriod} />}
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border px-4 py-2.5">
        <SummaryStat label="Strongest G10" currency={strongest?.currency} broad={loading ? undefined : strongest?.broad ?? null} />
        <SummaryStat label="Weakest G10" currency={weakest?.currency} broad={loading ? undefined : weakest?.broad ?? null} />
      </div>
      <div className="relative overflow-x-auto">
        {loading ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-card/80">
            <FxSectionStatus label="Loading G10 heatmap" />
          </div>
        ) : null}
        {failed ? (
          <FxSectionStatus message="G10 history is unavailable." />
        ) : (
          <table className="w-full min-w-[920px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 z-20 bg-card px-3 py-2 text-left font-semibold"> </th>
                {G10_CURRENCIES.map((currency) => (
                  <th key={currency} className="px-1.5 py-2 text-center font-semibold">
                    {currency}
                  </th>
                ))}
                <th className="sticky right-0 z-20 border-l border-border bg-card px-3 py-2 text-right font-semibold">
                  Broad Strength
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const broadTone = matrix ? matrixTone(row.broad) : {};
                return (
                <tr key={row.currency} className="border-b border-border/50 last:border-0">
                  <th className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left text-[11px] font-semibold text-foreground">
                    {row.currency}
                  </th>
                  {G10_CURRENCIES.map((column) => {
                    const diagonal = row.currency === column;
                    const value = matrix ? row.cells[column] : null;
                    const tone = diagonal || !matrix ? {} : matrixTone(value);
                    return (
                      <td
                        key={column}
                        title={diagonal || !matrix ? undefined : `${row.currency} vs ${column}`}
                        className={[
                          "px-1 py-1.5 text-center font-mono tabular-nums",
                          diagonal ? "bg-muted/40 text-transparent" : tone.color ? "" : changePctClass(matrix ? value : null),
                        ].join(" ")}
                        style={tone}
                      >
                        {diagonal || !matrix ? "" : fmtPct(value)}
                      </td>
                    );
                  })}
                  <td
                    className="sticky right-0 z-10 border-l border-border bg-card px-3 py-1.5 text-right font-mono tabular-nums"
                    style={{ background: broadTone.background }}
                  >
                    {matrix ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="w-3 text-right text-[10px] text-muted-foreground">{row.rank ?? ""}</span>
                        <span style={{ color: broadTone.color }} className={broadTone.color ? "" : changePctClass(row.broad)}>
                          {fmtPct(row.broad)}
                        </span>
                      </span>
                    ) : null}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

function SummaryStat({
  label,
  currency,
  broad,
}: {
  label: string;
  currency: string | undefined;
  broad: number | null | undefined;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold text-foreground">{currency ?? "—"}</span>
      <span className={`font-mono text-[12px] tabular-nums ${changePctClass(broad ?? null)}`}>
        {broad === undefined ? "" : `${fmtPct(broad)} broad`}
      </span>
    </div>
  );
}
