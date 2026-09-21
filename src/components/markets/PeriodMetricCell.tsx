function fmtPct(n: number | null, digits = 2): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function PeriodMetricCell({
  label,
  isYield,
  bps,
  pct,
  positive,
  fmtBps,
  className = "flex",
}: {
  label: string;
  isYield: boolean;
  bps: number | null;
  pct: number | null;
  positive: boolean;
  fmtBps: (bps: number) => string;
  className?: string;
}) {
  const hasValue = isYield ? bps !== null : pct !== null;
  const valueClass = `text-[14px] font-semibold leading-none ${
    hasValue ? (positive ? "text-pos" : "text-neg") : "text-foreground/65"
  }`;

  return (
    <div className={`shrink-0 items-baseline gap-1.5 whitespace-nowrap ${className}`}>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-foreground/65">{label}</span>
      {isYield ? (
        <span className={valueClass}>{bps !== null ? fmtBps(bps) : "—"}</span>
      ) : (
        <span className={valueClass}>{pct !== null ? `${positive ? "+" : ""}${fmtPct(pct, 2)}%` : "—"}</span>
      )}
    </div>
  );
}

/** Container-query classes for overview / monitor card footers (hide 1M, then 1Y). */
export const PERIOD_FOOTER_1M_VISIBLE = "hidden @min-[272px]/overview-card:flex";
export const PERIOD_FOOTER_1Y_VISIBLE = "hidden @min-[160px]/overview-card:flex";
