import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { formatPlusMinusPct2, formatSignedPct2 } from "@/lib/derivatives/format";
import type { SpxVixDayMove } from "@/lib/derivatives/vixSpxDayMove";

export const SPX_VIX_DAY_MOVE_EXPLAINER =
  "VIX is a 30-day implied volatility measure expressed on an annualized basis. Daily implied 1 Vol is approximated as VIX / √252.";

export const SX5E_VSTOXX_DAY_MOVE_EXPLAINER =
  "VSTOXX is a 30-day implied volatility measure expressed on an annualized basis. Daily implied 1 Vol is approximated as VSTOXX / √252.";

function Row({
  label,
  value,
  valueClass,
  info,
  explainer,
}: {
  label: string;
  value: string;
  valueClass?: string;
  info?: boolean;
  explainer: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </div>
        {info ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip open={open} onOpenChange={setOpen}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={explainer}
                  onClick={() => setOpen((v) => !v)}
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[300px] border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-relaxed text-foreground"
              >
                {explainer}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <div
        className={[
          "shrink-0 font-mono text-[15px] font-semibold tabular-nums tracking-tight",
          valueClass ?? "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

export function VixSpxDayMoveSection({
  move,
  equityLabel = "S&P 500 today",
  volDailyLabel = "VIX-implied daily 1 Vol",
  explainer = SPX_VIX_DAY_MOVE_EXPLAINER,
  framed = true,
}: {
  move: SpxVixDayMove;
  equityLabel?: string;
  volDailyLabel?: string;
  explainer?: string;
  framed?: boolean;
}) {
  return (
    <div className={framed ? "mt-3 space-y-2 border-t border-border/70 pt-3" : "space-y-2"}>
      <Row
        label={equityLabel}
        value={formatSignedPct2(move.spxChangePct)}
        valueClass={changePctClass(move.spxChangePct)}
        explainer={explainer}
      />
      <Row label={volDailyLabel} value={formatPlusMinusPct2(move.dailyImpliedSigmaPct)} info explainer={explainer} />
    </div>
  );
}
