import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import {
  VIX_IMPLIED_MOVE_EXPLAINER,
  VSTOXX_IMPLIED_MOVE_EXPLAINER,
  VixImpliedMoveLine,
  vixThirtyDayOneSigmaMovePct,
} from "@/components/markets/VixImpliedMoveLine";
import {
  SX5E_VSTOXX_DAY_MOVE_EXPLAINER,
  VixSpxDayMoveSection,
} from "@/components/derivatives/VixSpxDayMoveSection";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { formatSignedPct, formatVolIndex, formatVvixVixRatio } from "@/lib/derivatives/format";
import { VOL_INDICES } from "@/lib/derivatives/volIndices";
import type { VolIndexRow } from "@/lib/derivatives/volIndices";
import type { SpxVixDayMove } from "@/lib/derivatives/vixSpxDayMove";
import { SkewIndexCard } from "@/components/derivatives/SkewIndexCard";
import { PercentileScale } from "@/components/derivatives/PercentileScale";
import type { SkewIndexRow } from "@/lib/derivatives/skewIndex";
import { VVIX_VIX_RATIO_EXPLAINER } from "@/lib/derivatives/vvixIndex";

const CARD =
  "rounded-md border border-border bg-card/80 px-4 py-3.5 shadow-[0_1px_0_0_rgba(15,23,42,0.03)]";

function showImpliedMove(row: VolIndexRow, pending: boolean): boolean {
  if (pending || row.unavailableReason) return false;
  if (row.last == null) return false;
  if (row.id !== "vix" && row.id !== "vstoxx") return false;
  return vixThirtyDayOneSigmaMovePct(row.last) != null;
}

function VolIndexCard({
  row,
  pending,
  dayMove,
}: {
  row: VolIndexRow;
  pending: boolean;
  dayMove: SpxVixDayMove | null;
}) {
  const impliedMove = showImpliedMove(row, pending);
  const explainer = row.id === "vstoxx" ? VSTOXX_IMPLIED_MOVE_EXPLAINER : VIX_IMPLIED_MOVE_EXPLAINER;
  return (
    <article className={CARD}>
      <header className="mb-3 flex items-center gap-2.5 border-b border-border/70 pb-2.5">
        {row.countryId ? <EquityCountryFlag countryId={row.countryId} size="md" /> : null}
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{row.label}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{row.hint}</p>
        </div>
      </header>
      {impliedMove && row.last != null ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Last
            </div>
            <div
              className={[
                "mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight",
                pending ? "text-muted-foreground" : "text-foreground",
              ].join(" ")}
            >
              {pending ? "…" : formatVolIndex(row.last)}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Change
              </span>
              <span
                className={[
                  "font-mono text-[15px] font-semibold tabular-nums",
                  pending ? "text-muted-foreground" : changePctClass(row.changePct),
                ].join(" ")}
              >
                {pending ? "…" : formatSignedPct(row.changePct)}
              </span>
            </div>
          </div>
          <VixImpliedMoveLine vix={row.last} explainer={explainer} />
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Last
            </div>
            <div
              className={[
                "mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight",
                pending ? "text-muted-foreground" : "text-foreground",
              ].join(" ")}
            >
              {pending ? "…" : formatVolIndex(row.last)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Change
            </div>
            <div
              className={[
                "mt-1 font-mono text-[15px] font-semibold tabular-nums",
                pending ? "text-muted-foreground" : changePctClass(row.changePct),
              ].join(" ")}
            >
              {pending ? "…" : formatSignedPct(row.changePct)}
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
        <PercentileScale percentile={row.percentile1y} pending={pending} />
        {row.id === "vvix" ? (
          <div className="space-y-2 border-t border-border/70 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                VVIX/VIX
              </div>
              <div
                className={[
                  "shrink-0 font-mono text-[15px] font-semibold tabular-nums tracking-tight",
                  pending ? "text-muted-foreground" : "text-foreground",
                ].join(" ")}
              >
                {pending ? "…" : formatVvixVixRatio(row.vvixVixRatio ?? null)}
              </div>
            </div>
            <PercentileScale
              percentile={row.vvixVixRatioPercentile1y ?? null}
              pending={pending}
              label="Ratio 1Y percentile"
              explainer={VVIX_VIX_RATIO_EXPLAINER}
            />
          </div>
        ) : null}
        {!pending && dayMove ? (
          row.id === "vstoxx" ? (
            <VixSpxDayMoveSection
              move={dayMove}
              framed={false}
              equityLabel="Euro Stoxx 50 today"
              volDailyLabel="VSTOXX-implied daily 1 Vol"
              explainer={SX5E_VSTOXX_DAY_MOVE_EXPLAINER}
            />
          ) : (
            <VixSpxDayMoveSection move={dayMove} framed={false} />
          )
        ) : null}
      </div>
    </article>
  );
}

export function VolIndexCards({
  rows,
  isLoading,
  dayMove,
  vstoxxDayMove,
  skew,
}: {
  rows: readonly VolIndexRow[];
  isLoading: boolean;
  dayMove?: SpxVixDayMove | null;
  vstoxxDayMove?: SpxVixDayMove | null;
  skew?: SkewIndexRow | null;
}) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {VOL_INDICES.map((def) => {
        const row =
          byId.get(def.id) ??
          ({
            id: def.id,
            label: def.label,
            countryId: def.countryId,
            hint: def.hint,
            ticker: null,
            last: null,
            changePct: null,
            asOf: null,
            sourceLabel: null,
            unavailableReason: null,
            percentile1y: null,
            percentileAsOf: null,
            percentileObservationCount: 0,
          } satisfies VolIndexRow);
        return (
          <VolIndexCard
            key={def.id}
            row={row}
            pending={isLoading && row.last == null && !rows.length}
            dayMove={def.id === "vix" ? (dayMove ?? null) : def.id === "vstoxx" ? (vstoxxDayMove ?? null) : null}
          />
        );
      })}
      <SkewIndexCard row={skew ?? null} pending={isLoading && (skew == null || skew.last == null)} />
    </div>
  );
}
