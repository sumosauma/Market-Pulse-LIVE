import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatOrdinal } from "@/lib/derivatives/format";
import { percentileMarkerPercent } from "@/lib/derivatives/percentileScale";

export { percentileMarkerPercent } from "@/lib/derivatives/percentileScale";

export const PERCENTILE_SCALE_EXPLAINER =
  "Shows where the latest value ranks among approximately the last 252 trading-session observations. A higher percentile means a higher historical rank, not a buy or sell signal.";

const MARKER_PX = 10;

export function PercentileScale({
  percentile,
  pending = false,
  label = "1Y percentile",
  explainer = PERCENTILE_SCALE_EXPLAINER,
  compact = false,
  showHeader = true,
}: {
  percentile: number | null | undefined;
  pending?: boolean;
  label?: string;
  explainer?: string | null;
  compact?: boolean;
  showHeader?: boolean;
}) {
  const marker = pending ? null : percentileMarkerPercent(percentile);
  const ordinal = pending
    ? "…"
    : formatOrdinal(typeof percentile === "number" && Number.isFinite(percentile) ? percentile : null);
  const valueSize = compact ? "text-[13px]" : "text-[15px]";
  const labelSize = compact ? "text-[10px]" : "text-[10px]";

  return (
    <div>
      {showHeader ? (
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className={`${labelSize} font-semibold uppercase tracking-[0.1em] text-muted-foreground`}
            >
              {label}
            </div>
            {explainer ? <PercentileHelp explainer={explainer} /> : null}
          </div>
          <div
            className={[
              "shrink-0 font-mono font-semibold tabular-nums tracking-tight",
              valueSize,
              pending ? "text-muted-foreground" : "text-foreground",
            ].join(" ")}
          >
            {ordinal}
          </div>
        </div>
      ) : null}
      <div className={compact && showHeader ? "mt-1" : showHeader ? "mt-1.5" : compact ? "mt-0.5" : "mt-1.5"}>
        <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            Low
            {!showHeader && explainer ? <PercentileHelp explainer={explainer} /> : null}
          </span>
          <span>High</span>
        </div>
        <div className="mt-1" style={{ paddingLeft: MARKER_PX / 2, paddingRight: MARKER_PX / 2 }}>
          <div
            className={[
              "relative rounded-full",
              compact ? "h-1.5" : "h-[7px]",
              marker == null
                ? "bg-muted"
                : "bg-gradient-to-r from-emerald-500/80 via-amber-400/85 to-rose-500/80",
            ].join(" ")}
            role={marker == null ? undefined : "meter"}
            aria-label={label}
            aria-valuemin={marker == null ? undefined : 0}
            aria-valuemax={marker == null ? undefined : 100}
            aria-valuenow={marker == null ? undefined : marker}
            aria-valuetext={marker == null ? undefined : ordinal}
          >
            {marker != null ? (
              <span
                className="absolute top-1/2 z-[1] block rounded-full border-2 border-background bg-foreground shadow-sm"
                style={{
                  left: `${marker}%`,
                  width: MARKER_PX,
                  height: MARKER_PX,
                  transform: "translate(-50%, -50%)",
                }}
                data-percentile-marker=""
                data-percentile={String(marker)}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PercentileHelp({ explainer }: { explainer: string }) {
  const [open, setOpen] = useState(false);
  return (
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
  );
}
