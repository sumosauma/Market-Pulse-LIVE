import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarkets, MARKETS_QUERY_KEY, type Quote } from "@/lib/markets.functions";
import { PageShell, Panel } from "@/components/PageShell";
import {
  PERIOD_FOOTER_1M_VISIBLE,
  PERIOD_FOOTER_1Y_VISIBLE,
  PeriodMetricCell,
} from "@/components/markets/PeriodMetricCell";
import { MarketStatusChip, isQuoteHistoryStale } from "@/components/markets/MarketStatusChip";
import { QuoteSourceMeta } from "@/components/markets/QuoteSourceMeta";
import { MacroPulsePanel } from "@/components/MacroPulsePanel";
import { PolicyRatesPanel } from "@/components/PolicyRatesPanel";
import { getMacroPulse } from "@/lib/macroPulse/macroPulse.functions";
import { MACRO_PULSE_SCHEMA_VERSION } from "@/lib/macroPulse/types";
import { getPolicyRates, POLICY_RATES_QUERY_KEY } from "@/lib/policyRates/policyRates.functions";
import { Sparkline } from "@/components/Sparkline";
import { OverviewInstrumentGlyph } from "@/components/OverviewInstrumentGlyph";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Market Pulse AI — Institutional Macro Dashboard" },
      {
        name: "description",
        content:
          "Premium institutional macro and equity intelligence platform — clean, calm, analytical cross-asset dashboard.",
      },
    ],
  }),
  component: DashboardPage,
});

type OverviewQuoteSpec = Readonly<{
  quoteLabel: string;
  displayLabel: string;
  /** If label join drifts, still resolve the ticker row (Sweden 10Y ↔ SEGVB10YC). */
  fallbackSymbol?: string;
}>;

// Quote keys MUST match Quote.label / TICKERS labels for lookup; displayLabel is card UI only.
const OVERVIEW_ROWS: ReadonlyArray<OverviewQuoteSpec> = [
  { quoteLabel: "S&P 500", displayLabel: "S&P 500" },
  { quoteLabel: "OMX Stockholm 30", displayLabel: "OMXS30" },
  { quoteLabel: "US Dollar Index", displayLabel: "DXY" },
  { quoteLabel: "USD/SEK", displayLabel: "USD/SEK" },
  { quoteLabel: "Brent Crude", displayLabel: "Brent" },
  { quoteLabel: "Gold Spot", displayLabel: "Gold" },
  { quoteLabel: "US 10Y Yield", displayLabel: "US 10Y" },
  { quoteLabel: "Sweden 10Y Yield", displayLabel: "SWE 10Y", fallbackSymbol: "SEGVB10YC" },
];

// Low/High is only shown for actively traded instruments with true intraday ranges.
// Yields, FX fixings, SKEW, and sentiment indicators are excluded.
const LH_ALLOWED = new Set([
  "S&P 500",
  "OMX Stockholm 30",
  "US Dollar Index",
  "VIX Index",
  "Gold Spot",
  "Brent Crude",
]);

function fmt(n: number | null, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Right-side spark scale — 3 anchors (hi / mid / lo). Escalates decimals when rounding would collide. */
function sparkAxisLabels(hi: number, lo: number, label: string, unit?: string): { hi: string; mid: string; lo: string } {
  const mid = (hi + lo) / 2;
  const minD = unit === "%" ? 3 : label === "USD/SEK" ? 4 : 2;
  const maxD = unit === "%" ? 7 : label === "USD/SEK" ? 8 : 7;

  let pick: { hi: string; mid: string; lo: string } | null = null;
  const fmtN = (v: number, d: number): string => {
    if (unit === "%") return `${v.toFixed(d)}%`;
    if (label === "USD/SEK") {
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

function findByLabel(quotes: Quote[], label: string) {
  return quotes.find((q) => q.label === label);
}

function findOverviewQuote(quotes: Quote[], row: OverviewQuoteSpec) {
  const byLabel = findByLabel(quotes, row.quoteLabel);
  if (byLabel) return byLabel;
  if (row.fallbackSymbol) return quotes.find((q) => q.symbol === row.fallbackSymbol);
  return undefined;
}

function isStale(q: Quote): boolean {
  return isQuoteHistoryStale(q);
}

function OverviewErrStaleChip({ q, stale }: { q: Quote; stale: boolean }) {
  return <MarketStatusChip q={q} stale={stale} />;
}

function OverviewTodayColumn({
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
    <div className="flex flex-col items-end gap-1 text-right min-w-0">
      <div className="text-[12px] font-mono font-semibold uppercase tracking-wider text-foreground/65 leading-none">
        Today
      </div>
      {isYield ? (
        <div
          className={`text-[14px] font-mono font-semibold tabular-nums leading-none ${
            todayBps !== null ? (up ? "text-pos" : "text-neg") : "text-foreground/65"
          }`}
        >
          {todayBps !== null ? fmtBps(todayBps) : "N/A"}
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
              : "N/A"}
        </div>
      )}
    </div>
  );
}

function OverviewCard({
  q,
  quoteLabel,
  displayLabel,
  loading = false,
}: {
  q: Quote | undefined;
  quoteLabel: string;
  displayLabel: string;
  loading?: boolean;
}) {
  if (!q) {
    return (
      <div className="min-w-0 w-full rounded-md border border-border bg-card p-3">
        <div className="flex min-w-0 items-center gap-1.5 pt-px">
          <OverviewInstrumentGlyph label={quoteLabel} />
          <div className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-wider text-foreground/70">
            {displayLabel}
          </div>
        </div>
        <div className="mt-3 flex min-h-10 items-center justify-center">
          {loading ? (
            <YieldCurveFetchSpinner />
          ) : (
            <div className="text-[16px] font-mono tabular-nums font-medium leading-none text-foreground/55">N/A</div>
          )}
        </div>
      </div>
    );
  }

  const digits = q.unit === "%" ? 3 : 2;

  // For yield instruments (unit="%"), display Today/1W moves as basis points (1 bp = 0.01 pp).
  // q.change and q.change5d are absolute changes in percentage-point terms.
  const isYield = q.unit === "%";
  const todayBps = isYield && q.change !== null ? q.change * 100 : null;
  const fiveDayBps = isYield && q.change5d !== null ? q.change5d * 100 : null;
  const oneMonthBps = isYield && q.change1m !== null ? q.change1m * 100 : null;
  const oneYearBps = isYield && q.change1y !== null ? q.change1y * 100 : null;
  const fmtBps = (bps: number) => `${bps >= 0 ? "+" : ""}${bps.toFixed(1)} bps`;

  // Direction flags — same sign logic whether using % or bps
  const up = isYield ? (todayBps ?? 0) >= 0 : (q.changePercent ?? 0) >= 0;
  const up5 = isYield ? (fiveDayBps ?? 0) >= 0 : (q.changePercent5d ?? 0) >= 0;
  const up1m = isYield ? (oneMonthBps ?? 0) >= 0 : (q.changePercent1m ?? 0) >= 0;
  const up1y = isYield ? (oneYearBps ?? 0) >= 0 : (q.changePercent1y ?? 0) >= 0;

  // chartData = richer intraday/extended-daily series; falls back to history when absent
  // or when chartData has fewer than 2 valid (finite) price points.
  const validChartPts = q.chartData?.filter((p) => Number.isFinite(p.price));
  const chartSrc = validChartPts && validChartPts.length >= 2 ? validChartPts : q.history;
  const series = chartSrc.map((h) => h.price);
  const chartDates = chartSrc.map((h) => h.date);
  const sparkHeightCompact = 52;
  const sparkHeightWide = 76;
  let sparkHi: number | null = null;
  let sparkLo: number | null = null;
  let sparkScale: { hi: string; mid: string; lo: string } | null = null;
  if (series.length >= 2) {
    sparkHi = Math.max(...series);
    sparkLo = Math.min(...series);
    sparkScale = sparkAxisLabels(sparkHi, sparkLo, quoteLabel, q.unit);
  }
  const stale = isStale(q);

  const sparkRowCompact =
    series.length >= 2 && sparkHi !== null && sparkLo !== null && sparkScale !== null ? (
      <div className="mt-2 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <Sparkline
            values={series}
            dates={chartDates}
            width={300}
            height={sparkHeightCompact}
            className="w-full max-w-full"
          />
        </div>
        <div
          className="flex shrink-0 flex-col justify-between py-px"
          style={{ height: sparkHeightCompact, maxWidth: "4.75rem", minWidth: "3.5rem" }}
        >
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[9.5px] font-mono font-medium text-foreground/62">{sparkScale.hi}</span>
          </div>
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[8.85px] font-mono font-medium text-foreground/52">{sparkScale.mid}</span>
          </div>
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[9.5px] font-mono font-medium text-foreground/62">{sparkScale.lo}</span>
          </div>
        </div>
      </div>
    ) : null;

  const sparkRowWide =
    series.length >= 2 && sparkHi !== null && sparkLo !== null && sparkScale !== null ? (
      <div className="mt-2 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <Sparkline
            values={series}
            dates={chartDates}
            width={320}
            height={sparkHeightWide}
            className="w-full max-w-full"
          />
        </div>
        <div
          className="flex shrink-0 flex-col justify-between py-px"
          style={{ height: sparkHeightWide, maxWidth: "4.75rem", minWidth: "3.5rem" }}
        >
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[9.5px] font-mono font-medium text-foreground/62">{sparkScale.hi}</span>
          </div>
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[8.85px] font-mono font-medium text-foreground/52">{sparkScale.mid}</span>
          </div>
          <div className="flex justify-end">
            <span className="leading-none tabular-nums text-[9.5px] font-mono font-medium text-foreground/62">{sparkScale.lo}</span>
          </div>
        </div>
      </div>
    ) : null;

  const periodChangesRow = (
    <div className="mt-1.5 flex items-baseline justify-between gap-x-2 font-mono tabular-nums">
      <PeriodMetricCell
        label="1W"
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
      <div className="flex shrink-0 flex-nowrap items-center gap-x-2 text-[12px] font-mono tabular-nums leading-none whitespace-nowrap">
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

  /*
   * Wide vs compact is driven by named container `overview-card` on each card root (actual card width).
   * Tailwind emits: @container overview-card (min-width:320px) { … }
   * Fullscreen 4-across inside max-w-[1600px] main → ~384px/column (above 320). Grid items need min-w-0 so
   * the container width matches the column track (otherwise min-content can confuse layout).
   */
  return (
    <div className="@container/overview-card group min-h-0 min-w-0 w-full rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/30">
      {/* Narrow cards — stacked layout */}
      <div className="block @min-[320px]/overview-card:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pt-px">
            <OverviewInstrumentGlyph label={quoteLabel} />
            <div className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-wider text-foreground leading-tight">
              {displayLabel}
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2 pt-px min-w-0">
            <OverviewErrStaleChip q={q} stale={stale} />
            <OverviewTodayColumn
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
          <div className="font-mono tabular-nums text-[18px] font-semibold leading-none text-foreground">
            {fmt(q.price, digits)}
            {q.unit && <span className="ml-1 text-[11px] font-normal text-foreground/55">{q.unit}</span>}
          </div>
          <QuoteSourceMeta q={q} />
          {lowHighCompact}
        </div>
        {sparkRowCompact}
        {periodChangesRow}
      </div>

      {/* Wide cards — balanced header: name | centered price+L/H | Today */}
      <div className="hidden @min-[320px]/overview-card:block space-y-0">
        <div className="border-b border-border/55 pb-2">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
            <div className="flex min-w-0 items-center gap-2 pt-px justify-self-start">
              <div className="shrink-0">
                <OverviewInstrumentGlyph label={quoteLabel} />
              </div>
              <div className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-wider text-foreground leading-tight">
                {displayLabel}
              </div>
            </div>

            <div className="flex min-w-0 justify-center px-0.5">
              <div className="flex max-w-full flex-col items-center">
                <div className="flex max-w-full flex-nowrap items-center justify-center gap-x-2 whitespace-nowrap">
                  <span className="inline-flex shrink-0 items-baseline whitespace-nowrap font-mono tabular-nums text-[16px] font-semibold leading-none tracking-tight text-foreground">
                    {fmt(q.price, digits)}
                    {q.unit && <span className="ml-1 text-[10px] font-medium text-foreground/60">{q.unit}</span>}
                  </span>
                  {lowHighWide}
                </div>
                <QuoteSourceMeta q={q} />
              </div>
            </div>

            <div className="flex shrink-0 justify-self-end items-start gap-2 pt-px">
              <OverviewErrStaleChip q={q} stale={stale} />
              <OverviewTodayColumn
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
        {sparkRowWide}
        {periodChangesRow}
      </div>
    </div>
  );
}

function DashboardPage() {
  const fetchMarkets = useServerFn(getMarkets);
  const fetchMacroPulse = useServerFn(getMacroPulse);
  const fetchPolicyRates = useServerFn(getPolicyRates);
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: MARKETS_QUERY_KEY,
    queryFn: () => fetchMarkets(),
    refetchInterval: 60_000,
    staleTime: 0,
  });
  const { data: macroPulse, isLoading: macroLoading, refetch: refetchMacroPulse } = useQuery({
    queryKey: ["macro-pulse", MACRO_PULSE_SCHEMA_VERSION],
    queryFn: () => fetchMacroPulse(),
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
  });
  const { data: policyRates, isLoading: policyLoading } = useQuery({
    queryKey: POLICY_RATES_QUERY_KEY,
    queryFn: () => fetchPolicyRates(),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  const quotes = data?.quotes ?? [];
  const marketsLoading = !data && isPending;

  return (
    <PageShell
      title="Macro Dashboard"
      subtitle="Cross-asset overview · institutional snapshot · auto-refresh 1m"
      actions={
        <div className="flex items-center gap-2 text-[10.5px] font-mono font-medium uppercase tracking-wider text-foreground/60">
          <span>
            Updated {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "—"}
          </span>
          <button
            onClick={() => {
              void refetch();
              void refetchMacroPulse();
            }}
            className="rounded-sm border border-border bg-card px-3 py-1.5 text-[11px] font-medium tracking-wider text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {isFetching ? "Syncing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="mb-5 @container">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            Market Overview
          </h2>
          <span className="text-[10.5px] font-mono font-medium uppercase tracking-wider text-foreground/60">
            8 instruments · 1W
          </span>
        </div>
        {/*
          Container queries: columns follow overview width (inside max-w-[1600px] main), not raw viewport —
          avoids 4 cramped columns when the window is narrowed on a large monitor.

          Behavior: tight container → 1 col; readable default → 2; mid → 3; wide → 4 max (never 8).
        */}
        <div className="grid grid-cols-2 gap-2 @max-[440px]:grid-cols-1 @lg:grid-cols-3 @xl:grid-cols-4 [&>*]:min-w-0">
          {OVERVIEW_ROWS.map((row) => (
            <OverviewCard
              key={row.quoteLabel}
              q={findOverviewQuote(quotes, row)}
              quoteLabel={row.quoteLabel}
              displayLabel={row.displayLabel}
              loading={marketsLoading}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel title="Morning Brief" meta="institutional research note">
            <div className="space-y-3 p-4 text-[12.5px] leading-relaxed text-foreground">
              <Block label="Market Snapshot">
                Risk assets advanced as US 10Y eased and the dollar softened. OMX
                Stockholm 30 led European indices on industrial cyclicality, while
                VIX held below 20. Gold near record on continued central-bank
                accumulation; Brent contained in a tight range.
              </Block>
              <Block label="Rates">
                Lower yields + softer DXY + lower vol reads as a constructive
                risk-on backdrop. Breakevens stable suggests rate move is
                real-yield driven, supportive for duration-sensitive equities.
              </Block>
              <Block label="Currencies">
                SEK exporters (Volvo, Sandvik, Atlas) benefit from softer USD/SEK
                translation. Real-estate rebound fading as rate-cut path stalls;
                defensives losing relative bid.
              </Block>
              <Block label="Inflation data">
                US PCE print, ECB speakers on cut path, Riksbank commentary on
                SEK weakness, and earnings tone from Nordic large-cap industrials.
              </Block>
              <Block label="What to watch">
                US PCE print, ECB speakers on cut path, Riksbank commentary on
                SEK weakness, and earnings tone from Nordic large-cap industrials.
              </Block>
              <div className="pt-1">
                <Link
                  to="/morning-brief"
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                >
                  Open full brief →
                </Link>
              </div>
            </div>
          </Panel>

          <MacroPulsePanel data={macroPulse} isLoading={macroLoading} />
        </div>

        <PolicyRatesPanel data={policyRates} isLoading={policyLoading} />
      </div>

      <footer className="mt-6 border-t border-border pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Sources · Yahoo Finance · FRED · Millistream/DI (SE rates) · CNN Fear &amp; Greed · Prices delayed up to 15m · Not investment advice
      </footer>
    </PageShell>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">{label}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}
