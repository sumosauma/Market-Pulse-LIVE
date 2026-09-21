import type { CurveMoveLabel } from "@/lib/yieldCurves/types";

export function YieldCurveInterpretation({
  label,
  meanBps,
  shortEndBps,
  longEndBps,
}: {
  label: CurveMoveLabel;
  meanBps: number | null;
  shortEndBps: number | null;
  longEndBps: number | null;
}) {
  const fmtSignedBps = (n: number | null) =>
    n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)} bps`;

  return (
    <div className="rounded-sm border border-border bg-card/60 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Market interpretation
      </div>
      <p className="mt-2 text-[14px] font-semibold tracking-tight text-foreground">{label}</p>
      <dl className="mt-3 grid gap-2 font-mono text-[11px] text-muted-foreground sm:grid-cols-3">
        <div className="rounded-sm border border-border/60 bg-background/50 px-2 py-1.5">
          <dt className="text-[10px] uppercase tracking-wider">Mean shift</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{fmtSignedBps(meanBps)}</dd>
        </div>
        <div className="rounded-sm border border-border/60 bg-background/50 px-2 py-1.5">
          <dt className="text-[10px] uppercase tracking-wider">Short end (avg)</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{fmtSignedBps(shortEndBps)}</dd>
        </div>
        <div className="rounded-sm border border-border/60 bg-background/50 px-2 py-1.5">
          <dt className="text-[10px] uppercase tracking-wider">Long end (avg)</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{fmtSignedBps(longEndBps)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Rules: steepening / flattening compares average long-end versus short-end basis-point moves
        against a mostly-higher or mostly-lower curve. Parallel shift requires a tight distribution
        of point changes. Divergent patterns default to a mixed read.
      </p>
    </div>
  );
}
