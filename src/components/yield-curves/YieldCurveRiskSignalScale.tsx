/** Visual 2Y–10Y spread scale (10Y − 2Y) — presentation only. */

export const RISK_SIGNAL_SCALE_MIN = -50;
export const RISK_SIGNAL_SCALE_MAX = 125;

const SCALE_SPAN = RISK_SIGNAL_SCALE_MAX - RISK_SIGNAL_SCALE_MIN;
const TICKS = [-50, 0, 25, 75, 125] as const;

/** Zone boundaries on the scale (bps). */
const ZONES: readonly { to: number; className: string }[] = [
  {
    to: 0,
    className:
      "bg-rose-800/55 dark:bg-rose-700/50",
  },
  {
    to: 25,
    className:
      "bg-zinc-600/60 dark:bg-zinc-500/55",
  },
  {
    to: 75,
    className:
      "bg-amber-600/55 dark:bg-amber-600/50",
  },
  {
    to: RISK_SIGNAL_SCALE_MAX,
    className:
      "bg-emerald-700/55 dark:bg-emerald-600/50",
  },
];

function zoneWidth(from: number, to: number): string {
  return `${((to - from) / SCALE_SPAN) * 100}%`;
}

/** Map bps to 0–100% along the scale; clamped to [-50, 125]. */
export function riskSignalScalePosition(bps: number): number {
  const clamped = Math.max(RISK_SIGNAL_SCALE_MIN, Math.min(RISK_SIGNAL_SCALE_MAX, bps));
  return ((clamped - RISK_SIGNAL_SCALE_MIN) / SCALE_SPAN) * 100;
}

export type RiskSignalScaleMarker = Readonly<{
  bps: number;
  label?: string;
  role?: "primary" | "compare";
}>;

function MarkerNeedle({ marker }: { marker: RiskSignalScaleMarker }) {
  const left = `${riskSignalScalePosition(marker.bps)}%`;
  const isCompare = marker.role === "compare";

  return (
    <div
      className="absolute top-0 z-20 flex -translate-x-1/2 flex-col items-center"
      style={{ left }}
      title={marker.label ? `${marker.label}: ${marker.bps.toFixed(0)} bps` : undefined}
    >
      <div
        className={[
          "h-2.5 w-2.5 rotate-45 border-2 shadow-md",
          isCompare
            ? "border-foreground bg-background ring-1 ring-foreground/30"
            : "border-background bg-foreground ring-2 ring-foreground/25",
        ].join(" ")}
      />
      <div
        className={[
          "h-2.5 w-0.5 rounded-full",
          isCompare ? "bg-foreground/80" : "bg-foreground",
        ].join(" ")}
      />
    </div>
  );
}

function ScaleLegend({ markers }: { markers: readonly RiskSignalScaleMarker[] }) {
  if (markers.length <= 1) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {markers.map((m, i) => {
        const isCompare = m.role === "compare";
        return (
          <span
            key={`${m.role ?? "m"}-${m.label ?? i}`}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span
              className={[
                "inline-block h-2 w-2 shrink-0 rotate-45 border-2",
                isCompare
                  ? "border-foreground bg-background"
                  : "border-background bg-foreground shadow-sm",
              ].join(" ")}
              aria-hidden
            />
            <span className="font-medium text-foreground/85">{m.label ?? "—"}</span>
          </span>
        );
      })}
    </div>
  );
}

export function YieldCurveRiskSignalScale({
  markers,
  showLegend = false,
}: {
  markers: readonly RiskSignalScaleMarker[];
  showLegend?: boolean;
}) {
  if (!markers.length) return null;

  let segmentStart = RISK_SIGNAL_SCALE_MIN;

  return (
    <div className="mt-3 w-full">
      <div className="relative px-px pt-4 pb-0.5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5">
          {markers.map((m, i) => (
            <MarkerNeedle key={`${m.role ?? "m"}-${m.bps}-${i}`} marker={m} />
          ))}
        </div>

        <div className="relative flex h-2.5 overflow-hidden rounded-sm border border-border/80 bg-zinc-800/10 shadow-inner dark:bg-zinc-950/30">
          {ZONES.map((zone, idx) => {
            const width = zoneWidth(segmentStart, zone.to);
            const el = (
              <div
                key={zone.to}
                className={[
                  "h-full shrink-0",
                  zone.className,
                  idx < ZONES.length - 1 ? "border-r border-background/35" : "",
                ].join(" ")}
                style={{ width }}
              />
            );
            segmentStart = zone.to;
            return el;
          })}
          {TICKS.map((tick) => (
            <div
              key={`tick-${tick}`}
              className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground/30"
              style={{ left: `${riskSignalScalePosition(tick)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="relative mt-2 h-3.5">
        {TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute -translate-x-1/2 font-mono text-[11px] font-medium tabular-nums tracking-tight text-foreground/70"
            style={{ left: `${riskSignalScalePosition(tick)}%` }}
          >
            {tick}
          </span>
        ))}
      </div>

      {showLegend ? <ScaleLegend markers={markers} /> : null}
    </div>
  );
}

/** Presentation-only slope label for the current 2Y–10Y spread card. */
export function riskSignalInterpretation(bps: number): string {
  if (bps < 0) return "Inverted slope";
  if (bps <= 25) return "Flat slope";
  if (bps <= 75) return "Moderate slope";
  return "Steep slope";
}
