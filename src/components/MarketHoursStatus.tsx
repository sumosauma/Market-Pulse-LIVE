import { useEffect, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getMarketHoursStatuses,
  msUntilNextMarketBoundary,
  type MarketHoursStatus,
} from "@/lib/markets/marketHours";

function VenueChip({ status }: { status: MarketHoursStatus }) {
  const marketLabel = status.id === "us" ? "US" : "SE";
  const stateLabel = status.isOpen ? "Open" : "Closed";
  const next =
    status.calendarKnown && status.nextLabel ? (
      <>
        <span className="text-muted-foreground/70">·</span>
        <span>{status.nextLabel}</span>
      </>
    ) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1 whitespace-nowrap">
          <span className="text-muted-foreground">{marketLabel}</span>
          <span
            className={[
              "h-[6.5px] w-[6.5px] shrink-0 rounded-full",
              status.isOpen ? "market-open-dot" : "bg-muted-foreground/50",
            ].join(" ")}
            aria-hidden
          />
          <span className={status.isOpen ? "text-foreground" : "text-muted-foreground"}>{stateLabel}</span>
          {next}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-[260px] border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-relaxed text-foreground shadow-md"
      >
        <p className="font-medium text-foreground">{status.exchangeName}</p>
        <p className="mt-0.5 text-muted-foreground">
          Regular {status.regularHoursLocal} · {status.timeZone}
        </p>
        {status.calendarKnown && status.nextDetail ? (
          <p className="mt-0.5 text-muted-foreground">Next: {status.nextDetail}</p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">Session times unavailable (calendar not loaded).</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function MarketHoursStatus() {
  const [statuses, setStatuses] = useState<MarketHoursStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      const now = new Date();
      setStatuses(getMarketHoursStatuses(now));

      if (timeoutId) clearTimeout(timeoutId);
      const until = msUntilNextMarketBoundary(now);
      if (until != null && until < 15 * 60_000) {
        timeoutId = setTimeout(tick, Math.min(until + 250, 15 * 60_000));
      }
    };

    tick();
    intervalId = setInterval(tick, 15_000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (!statuses) {
    return (
      <div className="hidden h-[18px] min-w-[220px] items-center sm:flex" aria-hidden>
        <span className="text-[12.5px] font-mono uppercase tracking-wider text-muted-foreground/40">—</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className="hidden items-center gap-2 text-[12.5px] font-mono font-semibold uppercase tracking-wider text-muted-foreground sm:flex"
        aria-label="Market hours"
      >
        <VenueChip status={statuses[0]!} />
        <span className="text-muted-foreground/50" aria-hidden>
          |
        </span>
        <VenueChip status={statuses[1]!} />
      </div>
    </TooltipProvider>
  );
}
