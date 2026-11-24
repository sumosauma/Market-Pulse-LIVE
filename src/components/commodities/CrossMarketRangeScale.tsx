import type { CrossMarketHistory } from "@/lib/commodities/indicators";

const MARKER_PX = 9;

function markerPercent(value: number | null, low: number | null, high: number | null): number | null {
  if (
    value == null ||
    low == null ||
    high == null ||
    !Number.isFinite(value) ||
    !Number.isFinite(low) ||
    !Number.isFinite(high)
  ) {
    return null;
  }
  const span = high - low;
  if (!(span > 0)) return 50;
  return Math.min(100, Math.max(0, ((value - low) / span) * 100));
}

function formatEnd(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Compact 1Y Low–High track with today (filled) and 1W-ago (hollow) markers. */
export function CrossMarketRangeScale({
  history,
  digits,
  label,
}: {
  history: CrossMarketHistory;
  digits: number;
  label: string;
}) {
  const ready =
    history.unavailableReason == null &&
    history.latest != null &&
    history.weekAgo != null &&
    history.yearLow != null &&
    history.yearHigh != null;

  if (!ready) return null;

  const todayPct = markerPercent(history.latest, history.yearLow, history.yearHigh);
  const weekPct = markerPercent(history.weekAgo, history.yearLow, history.yearHigh);
  const overlap = todayPct != null && weekPct != null && Math.abs(todayPct - weekPct) < 3.5;

  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
            Low
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums leading-none text-muted-foreground">
            {formatEnd(history.yearLow!, digits)}
          </div>
        </div>
        <div className="pb-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          1Y range
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
            High
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums leading-none text-muted-foreground">
            {formatEnd(history.yearHigh!, digits)}
          </div>
        </div>
      </div>

      <div className="mt-2" style={{ paddingLeft: MARKER_PX / 2, paddingRight: MARKER_PX / 2 }}>
        <div
          className="relative h-[2px] bg-border"
          role="meter"
          aria-label={label}
          aria-valuemin={history.yearLow ?? undefined}
          aria-valuemax={history.yearHigh ?? undefined}
          aria-valuenow={history.latest ?? undefined}
        >
          <span
            className="absolute left-0 top-1/2 h-2 w-px -translate-y-1/2 bg-muted-foreground/45"
            aria-hidden
          />
          <span
            className="absolute right-0 top-1/2 h-2 w-px -translate-y-1/2 bg-muted-foreground/45"
            aria-hidden
          />
          {weekPct != null ? (
            <span
              className={[
                "absolute z-[1] block rounded-full border-[1.5px] border-foreground/65 bg-card",
                overlap ? "top-[18%]" : "top-1/2",
              ].join(" ")}
              style={{
                left: `${weekPct}%`,
                width: MARKER_PX,
                height: MARKER_PX,
                transform: "translate(-50%, -50%)",
              }}
              title="One week ago"
              aria-hidden
            />
          ) : null}
          {todayPct != null ? (
            <span
              className={[
                "absolute z-[2] block rounded-full bg-foreground",
                overlap ? "top-[82%]" : "top-1/2",
              ].join(" ")}
              style={{
                left: `${todayPct}%`,
                width: MARKER_PX - 1,
                height: MARKER_PX - 1,
                transform: "translate(-50%, -50%)",
              }}
              title="Latest history"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
