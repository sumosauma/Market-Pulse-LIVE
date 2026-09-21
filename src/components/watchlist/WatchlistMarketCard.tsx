import type { Quote } from "@/lib/markets.functions";
import { OverviewInstrumentGlyph } from "@/components/OverviewInstrumentGlyph";
import {
  PERIOD_FOOTER_1M_VISIBLE,
  PERIOD_FOOTER_1Y_VISIBLE,
  PeriodMetricCell,
} from "@/components/markets/PeriodMetricCell";
import { MarketStatusChip, isQuoteHistoryStale } from "@/components/markets/MarketStatusChip";
import { QuoteSourceMeta } from "@/components/markets/QuoteSourceMeta";
import { Sparkline } from "@/components/Sparkline";
import { FearGreedGauge } from "@/components/watchlist/FearGreedGauge";

const FEAR_GREED_SYMBOL = "FEARGREED";

const LH_ALLOWED = new Set([
  "S&P 500",
  "OMX Stockholm 30",
  "US Dollar Index",
  "VIX Index",
  "Gold Spot",
  "Brent Crude",
]);

function fmt(n: number | null, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function sparkAxisLabels(
  hi: number,
  lo: number,
  label: string,
  unit?: string,
): { hi: string; mid: string; lo: string } {
  const mid = (hi + lo) / 2;
  const minD = unit === "%" ? 3 : label === "USD/SEK" || label === "EUR/SEK" ? 4 : 2;
  const maxD = unit === "%" ? 7 : label === "USD/SEK" || label === "EUR/SEK" ? 8 : 7;

  let pick: { hi: string; mid: string; lo: string } | null = null;
  const fmtN = (v: number, d: number): string => {
    if (unit === "%") return `${v.toFixed(d)}%`;
    if (label === "USD/SEK" || label === "EUR/SEK") {
      return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  for (let d = minD; d <= maxD; d++) {
    const sHi = fmtN(hi, d);
    const sMid = fmtN(mid, d);
    const sLo = fmtN(lo, d);
    pick = { hi: sHi, mid: sMid, lo: sLo };
    if (new Set([sHi, sMid, sLo]).size === 3) break;
  }

  return pick!;
}

function isStale(q: Quote): boolean {
  return isQuoteHistoryStale(q);
}

function StatusChip({ q, stale }: { q: Quote; stale: boolean }) {
  return <MarketStatusChip q={q} stale={stale} />;
}

function TodayColumn({
  isYield,
  todayBps,
  up,
  q,
  quoteLabel,
  fmtBps,
}: {
  isYield: boolean;
  todayBps: number | null;
  up: boolean;
  q: Quote;
  quoteLabel: string;
  fmtBps: (bps: number) => string;
}) {
  return (
    <div className="flex w-[4.25rem] shrink-0 flex-col items-end gap-1 text-right sm:w-[4.5rem]">
      <div className="whitespace-nowrap text-[11px] font-mono font-semibold uppercase tracking-wider leading-none text-foreground/65">
        Today
      </div>
      {isYield ? (
        <div
          className={`text-[14px] font-mono font-semibold tabular-nums leading-none ${
            todayBps !== null ? (up ? "text-pos" : "text-neg") : "text-foreground/65"
          }`}
        >
          {todayBps !== null ? fmtBps(todayBps) : "—"}
        </div>
      ) : (
        <div
          className={`text-[14px] font-mono font-semibold tabular-nums leading-none ${
            q.changePercent !== null ? (up ? "text-pos" : "text-neg") : "text-foreground/65"
          }`}
        >
          {q.changePercent !== null
            ? `${up ? "+" : ""}${fmt(q.changePercent, 2)}%`
            : quoteLabel === "Gold Spot" && q.price !== null
              ? "Live spot"
              : "—"}
        </div>
      )}
    </div>
  );
}

export function WatchlistMarketCard({ q }: { q: Quote }) {
  const digits = q.unit === "%" ? 3 : 2;
  const isYield = q.unit === "%";
  const todayBps = isYield && q.change !== null ? q.change * 100 : null;
  const fiveDayBps = isYield && q.change5d !== null ? q.change5d * 100 : null;
  const oneMonthBps = isYield && q.change1m !== null ? q.change1m * 100 : null;
  const oneYearBps = isYield && q.change1y !== null ? q.change1y * 100 : null;
  const fmtBps = (bps: number) => `${bps >= 0 ? "+" : ""}${bps.toFixed(1)} bps`;
  const up = isYield ? (todayBps ?? 0) >= 0 : (q.changePercent ?? 0) >= 0;
  const up5 = isYield ? (fiveDayBps ?? 0) >= 0 : (q.changePercent5d ?? 0) >= 0;
  const up1m = isYield ? (oneMonthBps ?? 0) >= 0 : (q.changePercent1m ?? 0) >= 0;
  const up1y = isYield ? (oneYearBps ?? 0) >= 0 : (q.changePercent1y ?? 0) >= 0;

  const validChartPts = q.chartData?.filter((p) => Number.isFinite(p.price));
  const chartSrc = validChartPts && validChartPts.length >= 2 ? validChartPts : q.history;
  const series = chartSrc.map((h) => h.price);
  const chartDates = chartSrc.map((h) => h.date);
  const sparkHeightCompact = 52;
  const sparkHeightWide = 76;
  const fearGreedHeightCompact = 96;
  const fearGreedHeightWide = 108;

  let sparkHi: number | null = null;
  let sparkLo: number | null = null;
  let sparkScale: { hi: string; mid: string; lo: string } | null = null;
  if (series.length >= 2) {
    sparkHi = Math.max(...series);
    sparkLo = Math.min(...series);
    sparkScale = sparkAxisLabels(sparkHi, sparkLo, q.label, q.unit);
  }

  const stale = isStale(q);
  const quoteLabel = q.label;
  const displayLabel = quoteLabel === "OMX Stockholm 30" ? "OMX30" : quoteLabel;
  const isFearGreed = q.symbol === FEAR_GREED_SYMBOL;

  const sparkRow = (height: number) =>
    series.length >= 2 && sparkHi !== null && sparkLo !== null && sparkScale !== null ? (
      <div className="mt-2 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <Sparkline
            values={series}
            dates={chartDates}
            width={300}
            height={height}
            className="w-full max-w-full"
          />
        </div>
        <div
          className="flex shrink-0 flex-col justify-between py-1"
          style={{ height, maxWidth: "4.75rem", minWidth: "3.5rem" }}
        >
          <div className="flex justify-end">
            <span className="text-[9.5px] font-mono font-medium leading-[1.2] tabular-nums text-foreground/62">
              {sparkScale.hi}
            </span>
          </div>
          <div className="flex justify-end">
            <span className="text-[8.85px] font-mono font-medium leading-[1.2] tabular-nums text-foreground/52">
              {sparkScale.mid}
            </span>
          </div>
          <div className="flex justify-end">
            <span className="text-[9.5px] font-mono font-medium leading-[1.2] tabular-nums text-foreground/62">
              {sparkScale.lo}
            </span>
          </div>
        </div>
      </div>
    ) : null;

  const chartArea = (height: number, fearGreedHeight: number) =>
    isFearGreed ? <FearGreedGauge value={q.price} height={fearGreedHeight} /> : sparkRow(height);

  /*
   * Footer metrics respond to card width (@container/overview-card), not viewport.
   * Hide order: 1M first (narrow), then 1Y (very narrow); 5D always visible.
   */
  const periodFooter = (
    <div className="mt-3.5 flex items-baseline justify-between gap-x-2 font-mono tabular-nums">
      <PeriodMetricCell
        label="5D"
        isYield={isYield}
        bps={fiveDayBps}
        pct={q.changePercent5d}
        positive={up5}
        fmtBps={fmtBps}
      />
      <PeriodMetricCell
        label="1M"
        isYield={isYield}
        bps={oneMonthBps}
        pct={q.changePercent1m}
        positive={up1m}
        fmtBps={fmtBps}
        className={PERIOD_FOOTER_1M_VISIBLE}
      />
      <PeriodMetricCell
        label="1Y"
        isYield={isYield}
        bps={oneYearBps}
        pct={q.changePercent1y}
        positive={up1y}
        fmtBps={fmtBps}
        className={PERIOD_FOOTER_1Y_VISIBLE}
      />
    </div>
  );

  const lowHighCompact =
    LH_ALLOWED.has(quoteLabel) && (q.low !== null || q.high !== null) ? (
      <div className="mt-[6px] flex items-center gap-2.5 text-[12px] font-mono tabular-nums leading-none">
        {q.low !== null && (
          <span className="flex items-center gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-widest text-foreground/45">L</span>
            <span className="font-medium text-foreground/75">{fmt(q.low, digits)}</span>
          </span>
        )}
        {q.high !== null && (
          <span className="flex items-center gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-widest text-foreground/45">H</span>
            <span className="font-medium text-foreground/75">{fmt(q.high, digits)}</span>
          </span>
        )}
      </div>
    ) : null;

  const lowHighWide =
    LH_ALLOWED.has(quoteLabel) && (q.low !== null || q.high !== null) ? (
      <div className="flex shrink-0 flex-nowrap items-center gap-x-2 whitespace-nowrap text-[12px] font-mono tabular-nums leading-none">
        {q.low !== null && (
          <span className="flex items-center gap-1">
            <span className="text-[8.5px] font-medium uppercase tracking-widest text-foreground/50">L</span>
            <span className="font-semibold text-foreground">{fmt(q.low, digits)}</span>
          </span>
        )}
        {q.high !== null && (
          <span className="flex items-center gap-1">
            <span className="text-[8.5px] font-medium uppercase tracking-widest text-foreground/50">H</span>
            <span className="font-semibold text-foreground">{fmt(q.high, digits)}</span>
          </span>
        )}
      </div>
    ) : null;

  return (
    <div className="@container/overview-card group min-h-0 min-w-0 w-full rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="block @min-[320px]/overview-card:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-1.5 pt-px">
            <OverviewInstrumentGlyph label={quoteLabel} />
            <div className="min-w-0 line-clamp-2 text-[10px] font-semibold uppercase leading-snug tracking-wider text-foreground">
              {displayLabel}
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-1.5 pt-px">
            <StatusChip q={q} stale={stale} />
            <TodayColumn
              isYield={isYield}
              todayBps={todayBps}
              up={up}
              q={q}
              quoteLabel={quoteLabel}
              fmtBps={fmtBps}
            />
          </div>
        </div>
        <div className="mt-2.5 min-w-0">
          <div className="font-mono text-[18px] font-semibold tabular-nums leading-none text-foreground">
            {fmt(q.price, digits)}
            {q.unit ? (
              <span className="ml-1 text-[11px] font-normal text-foreground/55">{q.unit}</span>
            ) : null}
          </div>
          <QuoteSourceMeta q={q} />
          {lowHighCompact}
        </div>
        {chartArea(sparkHeightCompact, fearGreedHeightCompact)}
        {periodFooter}
      </div>

      <div className="hidden @min-[320px]/overview-card:block space-y-0">
        <div className="border-b border-border/55 pb-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
            <div className="flex min-w-0 items-start justify-self-start gap-1.5 self-center pt-px">
              <div className="shrink-0">
                <OverviewInstrumentGlyph label={quoteLabel} />
              </div>
              <div className="min-w-0 line-clamp-2 text-[10px] font-semibold uppercase leading-snug tracking-wider text-foreground">
                {displayLabel}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-self-center px-1">
              <div className="flex flex-nowrap items-center justify-center gap-x-2 whitespace-nowrap">
                <span className="inline-flex shrink-0 items-baseline font-mono text-[16px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
                  {fmt(q.price, digits)}
                  {q.unit ? (
                    <span className="ml-1 text-[10px] font-medium text-foreground/60">{q.unit}</span>
                  ) : null}
                </span>
                {lowHighWide}
              </div>
              <QuoteSourceMeta q={q} />
            </div>
            <div className="flex min-w-0 shrink-0 items-start justify-self-end justify-end gap-1.5 self-center pt-px">
              <StatusChip q={q} stale={stale} />
              <TodayColumn
                isYield={isYield}
                todayBps={todayBps}
                up={up}
                q={q}
                quoteLabel={quoteLabel}
                fmtBps={fmtBps}
              />
            </div>
          </div>
        </div>
        {chartArea(sparkHeightWide, fearGreedHeightWide)}
        {periodFooter}
      </div>
    </div>
  );
}
