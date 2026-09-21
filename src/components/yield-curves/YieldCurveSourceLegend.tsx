import { YIELD_SOURCE_TYPE_LABEL } from "@/lib/yieldCurves/sourceTypeUi";

export function YieldCurveSourceLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
      <span className="font-medium uppercase tracking-[0.08em]">Point types</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
        {YIELD_SOURCE_TYPE_LABEL.official}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full border-2 border-primary bg-card" aria-hidden />
        {YIELD_SOURCE_TYPE_LABEL.interpolated}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full border-2 border-amber-500/80 bg-card" aria-hidden />
        {YIELD_SOURCE_TYPE_LABEL.external}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono">—</span>
        Not published
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono">?</span>
        Unavailable
      </span>
    </div>
  );
}
