/** External chart legend — placed below plot area to avoid overlapping series. */
export function YieldCurveChartLegend({
  items,
}: {
  items: ReadonlyArray<{ label: string; color: string; dashed?: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border/60 px-4 py-3">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2 text-[11px] text-foreground">
          <svg width="28" height="10" aria-hidden className="shrink-0">
            <line
              x1="0"
              y1="5"
              x2="28"
              y2="5"
              stroke={item.color}
              strokeWidth={item.dashed ? 1.5 : 2}
              strokeDasharray={item.dashed ? "5 3" : undefined}
            />
          </svg>
          <span className="font-medium">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
