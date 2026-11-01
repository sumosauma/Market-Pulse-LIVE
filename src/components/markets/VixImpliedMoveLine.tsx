import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatPlusMinusPct2 } from "@/lib/derivatives/format";
import { vixImpliedDailyOneSigmaPct } from "@/lib/derivatives/vixSpxDayMove";

export const VIX_IMPLIED_MOVE_EXPLAINER =
  "Approximate one-standard-deviation S&P 500 move implied by VIX over 30 days. VIX is annualized, so the 30-day equivalent is calculated as VIX × √(30/365). This is not a directional forecast.";

export const VSTOXX_IMPLIED_MOVE_EXPLAINER =
  "Approximate one-standard-deviation Euro Stoxx 50 move implied by VSTOXX over 30 days. VSTOXX is annualized, so the 30-day equivalent is calculated as VSTOXX × √(30/365). This is not a directional forecast.";

export const ONE_DAY_IMPLIED_MOVE_EXPLAINER =
  "Approximate one-standard-deviation index move over one trading day, derived from annualized implied volatility using 252 trading days per year. This is not a directional forecast.";

/** Calendar 30-day 1σ move in percent: (VIX / 100) × √(30/365) × 100. */
export function vixThirtyDayOneSigmaMovePct(vix: number): number | null {
  if (!Number.isFinite(vix) || vix <= 0) return null;
  const pct = (vix / 100) * Math.sqrt(30 / 365) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function VixImpliedMoveLine({
  vix,
  explainer = VIX_IMPLIED_MOVE_EXPLAINER,
}: {
  vix: number;
  explainer?: string;
}) {
  const [open, setOpen] = useState(false);
  const movePct = vixThirtyDayOneSigmaMovePct(vix);
  if (movePct == null) return null;
  const formatted = movePct.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div className="min-w-0 text-right">
      <div className="flex items-center justify-end gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          30D implied 1 Vol move
        </div>
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
              className="max-w-[280px] border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-relaxed text-foreground"
            >
              {explainer}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-foreground">
        ±{formatted}%
      </div>
    </div>
  );
}

/** Latest annualized implied-vol index, scaled to one trading day: vol / √252. */
export function OneDayImpliedMoveLine({ vol }: { vol: number | null }) {
  const [open, setOpen] = useState(false);
  const movePct = vol == null ? null : vixImpliedDailyOneSigmaPct(vol);
  return (
    <div className="mt-3 min-w-0 text-right">
      <div className="flex items-center justify-end gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          1D Implied Move (1σ)
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label={ONE_DAY_IMPLIED_MOVE_EXPLAINER}
                onClick={() => setOpen((v) => !v)}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-[280px] border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-relaxed text-foreground"
            >
              {ONE_DAY_IMPLIED_MOVE_EXPLAINER}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-foreground">
        {formatPlusMinusPct2(movePct)}
      </div>
    </div>
  );
}
