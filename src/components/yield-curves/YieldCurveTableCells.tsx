import type { YieldPointSourceType } from "@/lib/yieldCurves/types";
import { tableCellClass, YIELD_SOURCE_TYPE_LABEL } from "@/lib/yieldCurves/sourceTypeUi";

function MissingBadge({ sourceType }: { sourceType: YieldPointSourceType }) {
  if (sourceType === "missing") {
    return (
      <span className="rounded-sm border border-border/80 bg-muted/30 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
        Not published
      </span>
    );
  }
  if (sourceType === "unavailable") {
    return (
      <span className="rounded-sm border border-border/80 bg-muted/30 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
        Unavailable
      </span>
    );
  }
  return null;
}

export function YieldTableYieldCell({
  value,
  sourceType,
  loading,
}: {
  value: number | null;
  sourceType: YieldPointSourceType;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-end gap-1 py-0.5">
        <span className="font-mono text-[13px] italic text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const title = YIELD_SOURCE_TYPE_LABEL[sourceType];

  if (value === null) {
    return (
      <div className="flex flex-col items-end gap-1 py-0.5" title={title}>
        <span className="font-mono text-[13px] text-muted-foreground">—</span>
        <MissingBadge sourceType={sourceType} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5 py-0.5" title={title}>
      <span className={`font-mono text-[13px] tabular-nums ${tableCellClass(sourceType)}`}>
        {value.toFixed(2)}%
      </span>
    </div>
  );
}

export function YieldTableBpsCell({
  value,
  loading,
}: {
  value: number | null;
  loading?: boolean;
}) {
  if (loading) {
    return <span className="font-mono text-[13px] italic text-muted-foreground">Loading…</span>;
  }
  if (value === null) {
    return <span className="font-mono text-[13px] text-muted-foreground">—</span>;
  }
  const s = `${value >= 0 ? "+" : ""}${value.toFixed(1)} bp`;
  return (
    <span
      className={[
        "font-mono text-[13px] tabular-nums",
        value > 0.05
          ? "text-destructive/90"
          : value < -0.05
            ? "text-pos"
            : "text-foreground",
      ].join(" ")}
    >
      {s}
    </span>
  );
}
