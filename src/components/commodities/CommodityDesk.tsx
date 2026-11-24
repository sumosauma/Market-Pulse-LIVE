import { useEffect, useState, type ReactNode } from "react";
import { ChartSpline, Info, LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CommodityInfo } from "@/components/commodities/CommodityInfo";
import {
  CHART_TOOLTIP_WRAPPER_STYLE,
  clampChartTooltipAnchor,
} from "@/components/commodities/chartTooltipPosition";
import { InstrumentMark } from "@/components/commodities/commodityMarks";
import {
  FuturesCurveCompareControls,
  FuturesCurvePanel,
  type OverlayHorizon,
} from "@/components/commodities/FuturesTermStructure";
import type { HistoryCurveHorizon } from "@/lib/commodities/futuresCurve";
import {
  SectorPerformancePanel,
  SectorPerformanceTitle,
} from "@/components/commodities/SectorPerformancePanel";
import { PercentileScale } from "@/components/derivatives/PercentileScale";
import { Panel } from "@/components/PageShell";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import { formatOrdinal } from "@/lib/derivatives/format";
import {
  DISPLAY_CURVE_MONTHS,
  curveCoversHorizon,
  curveWithinHorizon,
  type FuturesCurve,
  type FuturesTermStructure,
} from "@/lib/commodities/futuresCurve";
import { CommodityMarketSignals } from "@/components/commodities/CommodityMarketSignals";
import {
  type CommodityIndicators,
  type HistoryIndicator,
} from "@/lib/commodities/indicators";
import type { CommoditySignal, CommoditySignalsPayload } from "@/lib/commodities/signals";
import {
  isIntradayEnabled,
  type CommodityIntradayPayload,
  type CommodityIntradaySeries,
} from "@/lib/commodities/intraday";
import {
  type SectorPerformance,
  type SectorProviderId,
} from "@/lib/commodities/sectorPerformance";
import {
  COMMODITY_GROUPS,
  type CommodityOverview,
  type CommodityPoint,
  type CommodityQuote,
} from "@/lib/commodities/overview";
import {
  nordicCalendarChangePct,
  stockholmDateOffset,
  stockholmDateOffsetMonths,
  type NordicReturnHorizon,
} from "@/lib/commodities/nordicSysCalendar";
import {
  COMMODITY_CHART_WINDOW_SESSIONS,
  COMMODITY_SESSION_RETURN_STEPS,
  sessionLookbackReturnPct,
} from "@/lib/commodities/sessionReturns";

const INTRADAY_UNAVAILABLE_TITLE = "1D data unavailable";
const INTRADAY_UNAVAILABLE_DETAIL = "Insufficient reliable intraday data for this commodity.";
const INTRADAY_UNAVAILABLE_LINE = "1D unavailable · Insufficient reliable intraday data";

/** Short verified benchmark labels for instrument (i) tooltips — no provider names. */
const COMMODITY_BENCHMARKS: Record<string, string> = {
  brent: "Brent Crude Index",
  wti: "WTI Spot Index",
  ttf: "NYMEX TTF Futures",
  "henry-hub": "Natural Gas Index",
  "nordic-power": "Nordic System Day-Ahead",
  gold: "OTC Spot",
  silver: "OTC Spot",
  copper: "LME Cash",
  aluminium: "LME Cash",
  nickel: "LME Cash",
  wheat: "CBOT Wheat Futures",
  corn: "CBOT Corn Futures",
};

/**
 * Fully spelled-out pricing units for instrument (i) tooltips.
 * Verified against overview.server / Avanza / LME / Yahoo feed units — not futures-curve quotes.
 */
const COMMODITY_PRICING_UNITS: Record<string, string> = {
  brent: "USD per barrel",
  wti: "USD per barrel",
  "henry-hub": "USD per million British thermal units",
  ttf: "EUR per megawatt-hour",
  "nordic-power": "EUR per megawatt-hour",
  gold: "USD per troy ounce",
  silver: "USD per troy ounce",
  copper: "USD per metric tonne",
  aluminium: "USD per metric tonne",
  nickel: "USD per metric tonne",
  wheat: "US cents per bushel",
  corn: "US cents per bushel",
};

const STOCKHOLM_TZ = "Europe/Stockholm";

const RANGES = ["1D", "1M", "3M", "6M", "1Y"] as const;
type RangeId = (typeof RANGES)[number];
type DailyRangeId = Exclude<RangeId, "1D">;
const RANGE_SESSIONS: Record<DailyRangeId, number> = { ...COMMODITY_CHART_WINDOW_SESSIONS };

/** Nordic SYS prints every calendar day — chart windows are calendar, not sessions. */
const NORDIC_CHART_RANGES = ["1W", "1M", "MAX"] as const;
type NordicChartRangeId = (typeof NORDIC_CHART_RANGES)[number];

/**
 * List return columns (excl. 1D from the quote feed).
 * 1M/1Y session steps come from shared `COMMODITY_SESSION_RETURN_STEPS` so Overview
 * and Commodity Market Signals use the same chart-aligned lookback.
 */
const LIST_RETURN_HORIZONS = [
  { id: "1W" as const, sessions: COMMODITY_SESSION_RETURN_STEPS["1W"] },
  { id: "1M" as const, sessions: COMMODITY_SESSION_RETURN_STEPS["1M"] },
  { id: "1Y" as const, sessions: COMMODITY_SESSION_RETURN_STEPS["1Y"] },
];

function seriesForReturns(quote: CommodityQuote, hist: HistoryIndicator | undefined): CommodityPoint[] {
  // Same preference as the Price History chart (indicator bars when available).
  if (CHART_FROM_HISTORY_BARS.has(quote.id) && hist && hist.bars.length >= 2) {
    return hist.bars.map((bar) => ({ date: bar.date, price: bar.close }));
  }
  if (quote.chart.length >= 2) return quote.chart;
  if (hist?.bars?.length && hist.bars.length >= 2) {
    return hist.bars.map((bar) => ({ date: bar.date, price: bar.close }));
  }
  return [];
}

/** Nordic SYS prints every calendar day — use exact delivery-date lookbacks, never session counts. */
function listReturnChangePct(
  quote: CommodityQuote,
  series: CommodityPoint[],
  horizon: (typeof LIST_RETURN_HORIZONS)[number],
): number | null {
  if (quote.id === "nordic-power") {
    return nordicCalendarChangePct(series, horizon.id as NordicReturnHorizon);
  }
  return sessionLookbackReturnPct(series, horizon.sessions);
}

function formatListReturn(value: number | null, quoteId: string): string {
  if (value == null) return quoteId === "nordic-power" ? "N/A" : "—";
  return formatPercent(value);
}

/** Shared accents for view switch icons and metric-group rails (exact same hex). */
const VIEW_ACCENTS = {
  history: "#2563eb", // blue-600
  curve: "#d97706", // amber-600
} as const;

/**
 * Prefer indicator history bars for the Price History chart when they are the same
 * underlying series used for 20D realized vol (keeps chart and RV aligned).
 */
const CHART_FROM_HISTORY_BARS = new Set([
  "brent",
  "wti",
  "ttf",
  "henry-hub",
  "wheat",
  "corn",
  "gold",
  "silver",
  "copper",
  "aluminium",
  "nickel",
  "nordic-power",
]);

/** Instruments with a CME (or equivalent) futures strip loader. */
const CURVE_IDS = new Set([
  "brent",
  "wti",
  "henry-hub",
  "ttf",
  "gold",
  "silver",
  "copper",
  "aluminium",
  "wheat",
  "corn",
]);

/** Forward-curve tab enabled; may still show an unavailable state when coverage is insufficient. */
const CURVE_PANEL_IDS = new Set([...CURVE_IDS, "nordic-power", "nickel"]);

const NO_RELIABLE_CURVE_TITLE = "No reliable futures data available";

function unavailableCurveCopy(id: string): { title: string; message: string } {
  if (id === "nordic-power" || id === "nickel") {
    return {
      title: NO_RELIABLE_CURVE_TITLE,
      message: "Reliable, freely accessible futures data is currently unavailable.",
    };
  }
  if (id === "aluminium") {
    return {
      title: NO_RELIABLE_CURVE_TITLE,
      message: "Insufficient reliable, freely accessible futures data for the 12-month horizon.",
    };
  }
  return {
    title: NO_RELIABLE_CURVE_TITLE,
    message: "We could not identify a reliable, freely accessible futures data source covering the 12-month horizon.",
  };
}

type ViewId = "history" | "curve";

export function CommodityDesk({
  overview,
  curves,
  indicators,
  intraday,
  signals,
  overviewPending,
  curvesPending,
  indicatorsPending,
  intradayPending,
  signalsPending,
  overviewError,
  curvesError,
  signalsError,
  sectors,
  sectorsPending,
  sectorsError,
}: {
  overview: CommodityOverview | undefined;
  curves: FuturesTermStructure | undefined;
  indicators: CommodityIndicators | undefined;
  intraday: CommodityIntradayPayload | undefined;
  signals: CommoditySignalsPayload | undefined;
  overviewPending: boolean;
  curvesPending: boolean;
  indicatorsPending: boolean;
  intradayPending: boolean;
  signalsPending: boolean;
  overviewError: string | null;
  curvesError: string | null;
  signalsError: string | null;
  sectors: SectorPerformance | undefined;
  sectorsPending: boolean;
  sectorsError: string | null;
}) {
  const [selectedId, setSelectedId] = useState("brent");
  const [view, setView] = useState<ViewId>("history");
  const [range, setRange] = useState<RangeId>("1Y");
  const [nordicRange, setNordicRange] = useState<NordicChartRangeId>("MAX");
  const [curveOverlays, setCurveOverlays] = useState<OverlayHorizon[]>(["1w"]);
  const [provider, setProvider] = useState<SectorProviderId>("invesco");
  const quote = overview?.quotes.find((item) => item.id === selectedId) ?? null;
  const curve = curves?.curves.find((item) => item.id === selectedId) ?? null;
  const history = indicators?.history.find((item) => item.id === selectedId) ?? null;
  const intradayRow = intraday?.series.find((item) => item.id === selectedId);
  const intradayOk = isIntradayEnabled(intradayRow);

  useEffect(() => {
    // Fall back to 1M — never leave an empty/error chart when 1D is unsupported.
    if (selectedId === "nordic-power") return;
    if (range === "1D" && !intradayPending && !intradayOk) setRange("1M");
  }, [selectedId, range, intradayOk, intradayPending]);

  useEffect(() => {
    // Nordic Price History defaults to MAX (full available SYS history).
    if (selectedId === "nordic-power") setNordicRange("MAX");
  }, [selectedId]);

  function handleSelectSignal(signal: CommoditySignal) {
    setSelectedId(signal.commodityId);
    setView(signal.analysisView === "curve" ? "curve" : "history");
    if (signal.commodityId === "nordic-power") {
      setNordicRange(signal.analysisRange === "1Y" ? "MAX" : "1M");
    } else {
      const nextRange = signal.analysisRange === "1D" ? "1M" : signal.analysisRange;
      setRange(nextRange);
    }
    // Bring Analysis into view after selection.
    requestAnimationFrame(() => {
      document.getElementById("commodities-analysis")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <div className="space-y-4">
      {overview?.fromStaleCache ||
      curves?.fromStaleCache ||
      indicators?.fromStaleCache ||
      intraday?.fromStaleCache ||
      signals?.fromStaleCache ? (
        <div className="space-y-0.5 text-[12px] text-amber-800 dark:text-amber-400">
          <p className="font-medium">Cached data in use</p>
          <p className="text-muted-foreground">
            {[
              overview?.fromStaleCache ? "Market Overview prices" : null,
              indicators?.fromStaleCache ? "Price History / 20D RV" : null,
              intraday?.fromStaleCache ? "1D intraday charts" : null,
              curves?.fromStaleCache ? "Futures curves" : null,
              signals?.fromStaleCache ? "Market Signals" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {" — "}
            the latest live refresh failed; showing the last successful server snapshot. Not a live quote.
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,2.8fr)]">
        <Panel title="Market Overview" className="flex h-full flex-col">
          {overviewPending && !overview ? (
            <div className="flex h-40 items-center justify-center">
              <YieldCurveFetchSpinner label="Loading commodity prices" />
            </div>
          ) : overviewError && !overview ? (
            <p className="p-4 text-[12px] leading-relaxed text-muted-foreground">Data unavailable. {overviewError}</p>
          ) : overview ? (
            <CommodityTable
              quotes={overview.quotes}
              history={indicators?.history ?? []}
              indicatorsPending={indicatorsPending && !indicators}
              selectedId={quote?.id ?? selectedId}
              onSelect={setSelectedId}
            />
          ) : null}
        </Panel>

        <Panel
          className="flex h-full flex-col"
          title="Analysis"
          actions={
            (curvesPending && curves) || (indicatorsPending && indicators) ? (
              <YieldCurveFetchSpinner label="Refreshing analysis" />
            ) : null
          }
        >
          <div id="commodities-analysis" className="flex min-h-0 flex-1 flex-col">
            {!quote && overviewPending ? (
              <div className="flex h-40 items-center justify-center">
                <YieldCurveFetchSpinner label="Loading analysis" />
              </div>
            ) : !quote ? (
              <p className="p-4 text-[12px] text-muted-foreground">Select a commodity with a verified price.</p>
            ) : (
              <Analysis
                quote={quote}
                curve={CURVE_IDS.has(quote.id) ? curve : null}
                curveKnown={CURVE_PANEL_IDS.has(quote.id)}
                history={history}
                intraday={intradayRow}
                intradayPending={intradayPending && !intraday}
                view={view}
                range={range}
                nordicRange={nordicRange}
                curveOverlays={curveOverlays}
                onView={setView}
                onRange={setRange}
                onNordicRange={setNordicRange}
                onCurveOverlays={setCurveOverlays}
                curvesPending={curvesPending && !curves}
                curvesError={curvesError}
                indicatorsPending={indicatorsPending && !indicators}
              />
            )}
          </div>
        </Panel>
      </div>

      <CommodityMarketSignals
        payload={signals}
        pending={signalsPending}
        error={signalsError}
        onSelectSignal={handleSelectSignal}
      />

      <Panel
        title={
          <SectorPerformanceTitle
            provider={provider}
            data={sectors?.providers?.[provider] ?? null}
            fromStaleCache={sectors?.fromStaleCache}
          />
        }
        actions={
          sectorsPending && sectors ? <YieldCurveFetchSpinner label="Refreshing commodity product returns" /> : null
        }
      >
        <SectorPerformancePanel
          data={sectors}
          pending={sectorsPending}
          error={sectorsError}
          provider={provider}
          onProvider={setProvider}
        />
      </Panel>
    </div>
  );
}

function CommodityTable({
  quotes,
  history,
  indicatorsPending,
  selectedId,
  onSelect,
}: {
  quotes: CommodityQuote[];
  history: HistoryIndicator[];
  indicatorsPending: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const historyById = new Map(history.map((row) => [row.id, row]));
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <th className="py-2 pl-3 pr-0 font-semibold">Commodity</th>
          <th className="py-2 pl-0 pr-2 text-right font-semibold">Last</th>
          <th className="px-2 py-2 text-right font-semibold">1D %</th>
          <th className="px-2 py-2 text-right font-semibold">1W %</th>
          <th className="px-2 py-2 text-right font-semibold">1M %</th>
          <th className="px-2 py-2 text-right font-semibold">1Y %</th>
          <th className="px-3 py-2 text-right font-semibold">20D RV</th>
        </tr>
      </thead>
      <tbody>
        {COMMODITY_GROUPS.map((group) => {
          const rows = quotes.filter((quote) => quote.group === group.id);
          if (rows.length === 0) return null;
          return (
            <GroupRows
              key={group.id}
              label={group.label}
              rows={rows}
              historyById={historyById}
              indicatorsPending={indicatorsPending}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function GroupRows({
  label,
  rows,
  historyById,
  indicatorsPending,
  selectedId,
  onSelect,
}: {
  label: string;
  rows: CommodityQuote[];
  historyById: Map<string, HistoryIndicator>;
  indicatorsPending: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td className="pb-1 pl-3 pr-0 pt-2.5">
          <div className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
        </td>
        <td className="pl-0 pr-2" aria-hidden />
        <td className="px-2" aria-hidden />
        <td className="px-2" aria-hidden />
        <td className="px-2" aria-hidden />
        <td className="px-2" aria-hidden />
        <td className="px-3" aria-hidden />
      </tr>
      {rows.map((quote) => {
        const selected = quote.id === selectedId;
        const missing = quote.price == null;
        const hist = historyById.get(quote.id);
        const rv20 = hist?.rv20 ?? null;
        const rvPercentile = hist?.rvPercentile1y ?? null;
        const returnSeries = seriesForReturns(quote, hist);
        return (
          <tr
            key={quote.id}
            role="button"
            tabIndex={0}
            aria-selected={selected}
            aria-label={quote.name}
            title={rowDetail(quote)}
            onClick={() => onSelect(quote.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(quote.id);
              }
            }}
            className={[
              "cursor-pointer border-b border-border/70 outline-none transition-colors",
              selected ? "bg-muted/70 shadow-[inset_2px_0_0_0_var(--foreground)]" : "hover:bg-muted/30",
            ].join(" ")}
          >
            <td className="py-1.5 pl-3 pr-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <InstrumentMark id={quote.id} size="sm" />
                <div className="truncate text-[12px] font-medium text-foreground">{quote.name}</div>
              </div>
            </td>
            <td className="py-1.5 pl-0 pr-2 text-right font-mono text-[12.5px] font-semibold tabular-nums tracking-tight text-foreground">
              {missing ? "—" : formatPrice(quote.price!, quote.unit)}
              {!missing && quote.unit ? (
                <div className="text-[10px] font-sans font-normal tracking-normal text-muted-foreground">{quote.unit}</div>
              ) : null}
            </td>
            <td className={`px-2 py-1.5 text-right font-mono text-[12.5px] font-semibold tabular-nums tracking-tight ${percentClass(quote.changePercent1d)}`}>
              {formatListReturn(quote.changePercent1d, quote.id)}
            </td>
            {LIST_RETURN_HORIZONS.map((horizon) => {
              const value = listReturnChangePct(quote, returnSeries, horizon);
              return (
                <td
                  key={horizon.id}
                  className={`px-2 py-1.5 text-right font-mono text-[12.5px] font-semibold tabular-nums tracking-tight ${percentClass(value)}`}
                >
                  {formatListReturn(value, quote.id)}
                </td>
              );
            })}
            <td className="px-3 py-1 text-right align-middle">
              {indicatorsPending ? (
                <span className="font-mono text-[12.5px] font-semibold tabular-nums text-muted-foreground">…</span>
              ) : rv20 == null ? (
                <span className="font-mono text-[12.5px] font-semibold tabular-nums text-muted-foreground">N/A</span>
              ) : (
                <div className="ml-auto w-[108px] text-center">
                  <div className="font-mono text-[12.5px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
                    {formatRv20(hist ?? null, false)}
                  </div>
                  {rvPercentile == null ? (
                    <div className="mt-0.5 font-mono text-[10px] leading-none text-muted-foreground">—</div>
                  ) : (
                    <PercentileScale
                      percentile={rvPercentile}
                      compact
                      showHeader={false}
                      explainer={null}
                    />
                  )}
                </div>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Analysis({
  quote,
  curve,
  curveKnown,
  history,
  intraday,
  intradayPending,
  view,
  range,
  nordicRange,
  curveOverlays,
  onView,
  onRange,
  onNordicRange,
  onCurveOverlays,
  curvesPending,
  curvesError,
  indicatorsPending,
}: {
  quote: CommodityQuote;
  curve: FuturesCurve | null;
  curveKnown: boolean;
  history: HistoryIndicator | null;
  intraday: CommodityIntradaySeries | undefined;
  intradayPending: boolean;
  view: ViewId;
  range: RangeId;
  nordicRange: NordicChartRangeId;
  curveOverlays: OverlayHorizon[];
  onView: (view: ViewId) => void;
  onRange: (range: RangeId) => void;
  onNordicRange: (range: NordicChartRangeId) => void;
  onCurveOverlays: (overlays: OverlayHorizon[]) => void;
  curvesPending: boolean;
  curvesError: string | null;
  indicatorsPending: boolean;
}) {
  const isNordic = quote.id === "nordic-power";
  const series = priceSeries(quote, history);
  const intradayOk = isIntradayEnabled(intraday);
  const intradayUnavailable = !intradayPending && !intradayOk;
  // While falling back from an unsupported 1D selection, keep a daily chart on screen.
  const chartRange: RangeId =
    range === "1D" && intradayUnavailable ? "1M" : range;
  const showingIntraday = !isNordic && view === "history" && chartRange === "1D" && intradayOk;
  const nordicRanged =
    isNordic && series ? sliceNordicCalendarRange(series.points, nordicRange) : null;
  const dailyRanged =
    !isNordic && !showingIntraday && series && chartRange !== "1D"
      ? sliceRange(series.points, chartRange)
      : null;
  const ranged = showingIntraday
    ? intraday && {
        points: intraday.points,
        partial: false,
        intraday: true as const,
      }
    : nordicRanged
      ? { points: nordicRanged, partial: false, intraday: false as const }
      : dailyRanged
        ? { points: dailyRanged.points, partial: dailyRanged.partial, intraday: false as const }
        : null;
  const nordicHeading =
    isNordic && ranged && ranged.points.length > 0
      ? {
          title: `Price History · ${formatNordicHistorySpan(ranged.points[0]!.date, ranged.points[ranged.points.length - 1]!.date)}`,
          count: `${ranged.points.length} daily prices`,
        }
      : null;
  const shown = curve?.enabled ? curveWithinHorizon(curve, DISPLAY_CURVE_MONTHS) : curve;
  const coversHorizon = curve?.enabled ? curveCoversHorizon(curve, DISPLAY_CURVE_MONTHS) : false;
  const verifiedCount = shown?.points.filter((point) => !point.gap && point.price != null).length ?? 0;
  const noSourceCurve = quote.id === "nordic-power" || quote.id === "nickel";
  const unavailable = unavailableCurveCopy(quote.id);
  const showCurveCompare =
    view === "curve" &&
    !curvesPending &&
    !noSourceCurve &&
    curveKnown &&
    curve?.enabled === true &&
    coversHorizon &&
    verifiedCount > 0;

  function toggleCurveHorizon(horizon: HistoryCurveHorizon) {
    if (horizon === "today") {
      onCurveOverlays([]);
      return;
    }
    onCurveOverlays(
      curveOverlays.includes(horizon)
        ? curveOverlays.filter((entry) => entry !== horizon)
        : [...curveOverlays, horizon],
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <InstrumentMark id={quote.id} size="md" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">{quote.name}</span>
            <span className="font-mono text-[22px] font-semibold tabular-nums leading-none text-foreground">
              {quote.price == null ? "—" : formatPrice(quote.price, quote.unit)}
            </span>
            <span className="text-[12px] text-muted-foreground">{quote.unit ?? ""}</span>
            {view === "history" && intradayUnavailable ? (
              <span className="ml-3 inline-flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  1D %
                </span>
                <span className={`font-mono text-[13px] tabular-nums ${percentClass(quote.changePercent1d)}`}>
                  {quote.changePercent1d == null ? "—" : formatPercent(quote.changePercent1d)}
                </span>
              </span>
            ) : null}
            {quote.stale ? (
              <span
                title="The Last price feed timestamp is older than the freshness threshold. Not a live quote."
                className="inline-flex rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800 dark:text-amber-400"
              >
                Delayed
              </span>
            ) : null}
          </div>
          {view === "history" ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Chart range
                </span>
                <div className="flex gap-1" role="tablist" aria-label="Price history range">
                  {isNordic
                    ? NORDIC_CHART_RANGES.map((item) => (
                        <Chip
                          key={item}
                          active={nordicRange === item}
                          onClick={() => onNordicRange(item)}
                        >
                          {item}
                        </Chip>
                      ))
                    : RANGES.map((item) => {
                        const disabled1d = item === "1D" && intradayUnavailable;
                        if (disabled1d) {
                          return (
                            <TooltipProvider key={item} delayDuration={150}>
                              <UiTooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Chip active={false} disabled onClick={() => {}}>
                                      {item}
                                    </Chip>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="bottom"
                                  align="end"
                                  className="max-w-[240px] border border-border bg-card px-2.5 py-2 text-left shadow-md"
                                >
                                  <p className="text-[11px] font-semibold leading-snug text-foreground">
                                    {INTRADAY_UNAVAILABLE_TITLE}
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-normal leading-snug text-muted-foreground">
                                    {INTRADAY_UNAVAILABLE_DETAIL}
                                  </p>
                                </TooltipContent>
                              </UiTooltip>
                            </TooltipProvider>
                          );
                        }
                        return (
                          <Chip
                            key={item}
                            active={chartRange === item}
                            onClick={() => onRange(item)}
                          >
                            {item}
                          </Chip>
                        );
                      })}
                </div>
              </div>
              {intradayUnavailable ? (
                <p className="inline-flex max-w-full items-center gap-1 text-[10px] leading-none text-muted-foreground/80">
                  <Info className="size-3 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  <span className="truncate font-medium text-muted-foreground">{INTRADAY_UNAVAILABLE_LINE}</span>
                </p>
              ) : null}
            </div>
          ) : showCurveCompare ? (
            <FuturesCurveCompareControls overlays={curveOverlays} onToggle={toggleCurveHorizon} />
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-3">
        <ViewSwitch view={view} onView={onView} curveAvailable={curveKnown} />
      </div>

      {view === "history" ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
          {!isNordic && range === "1D" && intradayPending ? (
            <div className="flex min-h-[280px] flex-1 items-center justify-center">
              <YieldCurveFetchSpinner label="Loading intraday chart" />
            </div>
          ) : !ranged ? (
            <EmptyChart message={quote.historyNote ?? "Price history is unavailable for this instrument."} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Match FuturesCurvePanel toolbar height so plot areas align. */}
              <div className="flex min-h-8 w-full shrink-0 items-center gap-3 px-1">
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold leading-snug tracking-tight text-foreground">
                  <span className="truncate py-0.5">
                    {nordicHeading
                      ? nordicHeading.title
                      : showingIntraday
                        ? `${quote.name} · 1D`
                        : `${quote.name} price history`}
                  </span>
                  <CommodityInfo label="About this instrument">
                    <InstrumentTooltipBody quote={quote} />
                  </CommodityInfo>
                </p>
                {nordicHeading ? (
                  <p className="shrink-0 text-right text-[10px] text-muted-foreground">{nordicHeading.count}</p>
                ) : !showingIntraday && ranged.partial && chartRange !== "1D" ? (
                  <p className="shrink-0 text-right text-[10px] text-muted-foreground">
                    {ranged.points.length}/{RANGE_SESSIONS[chartRange as DailyRangeId]} sessions
                  </p>
                ) : null}
              </div>
              <PriceChart
                key={
                  isNordic
                    ? `${quote.id}-${nordicRange}-${ranged.points.length}`
                    : `${quote.id}-${chartRange}-${ranged.points.length}-${ranged.intraday ? "i" : "d"}`
                }
                points={ranged.points}
                unit={quote.unit}
                intraday={ranged.intraday}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
          {curvesPending ? (
            <div className="flex min-h-[280px] flex-1 items-center justify-center">
              <YieldCurveFetchSpinner label="Loading futures curve" />
            </div>
          ) : curvesError && !curve && !noSourceCurve ? (
            <EmptyChart message={`Futures curve data unavailable. ${curvesError}`} />
          ) : noSourceCurve ? (
            <EmptyChart title={unavailable.title} message={unavailable.message} />
          ) : !curveKnown ? (
            <EmptyChart message="No verified futures curve is published for this instrument." />
          ) : !curve?.enabled ? (
            <EmptyChart title={NO_RELIABLE_CURVE_TITLE} message={curve?.unavailableReason ?? unavailable.message} />
          ) : !coversHorizon ? (
            <EmptyChart title={unavailable.title} message={unavailable.message} />
          ) : verifiedCount === 0 ? (
            <EmptyChart message="No verified contract delivers within the 12-month horizon." />
          ) : (
            <FuturesCurvePanel key={quote.id} curve={shown ?? curve} overlays={curveOverlays} />
          )}
        </div>
      )}

      <div className="shrink-0">
        <IndicatorStrip
          quote={quote}
          curve={curveKnown && coversHorizon ? shown : null}
          history={history}
          indicatorsPending={indicatorsPending}
          curvesPending={curvesPending}
        />
      </div>
    </div>
  );
}

function IndicatorStrip({
  quote,
  curve,
  history,
  indicatorsPending,
  curvesPending,
}: {
  quote: CommodityQuote;
  curve: FuturesCurve | null;
  history: HistoryIndicator | null;
  indicatorsPending: boolean;
  curvesPending: boolean;
}) {
  const curveReady = curve?.enabled === true;
  const absChange = history?.rvKind === "abs_change";
  const percentile = absChange ? history?.rvPercentile1y ?? null : history?.percentile ?? null;
  const spreadValue =
    !curvesPending && curveReady && curve.spreadM1M2 != null
      ? `${formatSigned(curve.spreadM1M2, curve.digits)} ${curve.unit ?? ""}`.trim()
      : null;
  /** Actual front two listed delivery months on the displayed strip (axis labels, e.g. Jan 27 − Feb 27). */
  const spreadLegs =
    curveReady && curve
      ? curve.points.filter((point) => !point.gap && point.price != null).slice(0, 2)
      : [];
  const spreadMonths =
    spreadLegs.length === 2
      ? `${spreadLegs[0]!.axisLabel} − ${spreadLegs[1]!.axisLabel}`
      : curveReady && curve.spreadM1M2Label
        ? curve.spreadM1M2Label
        : null;
  const spreadSubtitle = spreadMonths;
  const rvLabel = "20D Realized Volatility";
  const rvTooltip = "Annualized volatility based on the last 20 daily price returns.";
  const pricePercentileTooltip =
    "Ranks the latest closing price against closing prices over the past year.";

  const shape = !curvesPending && curveReady ? curve.shape ?? null : null;
  const spreadSigned =
    !curvesPending && curveReady && curve.spreadM1M2 != null ? curve.spreadM1M2 : null;
  const rvDisplay = formatRv20(history, indicatorsPending);
  const pctDisplay = indicatorsPending
    ? "…"
    : percentile == null
      ? "—"
      : absChange
        ? percentile < 0.5
          ? "Below 1st"
          : formatOrdinal(percentile)
        : percentile < 0.5
          ? "Below 1st percentile"
          : `${formatOrdinal(percentile)} percentile`;

  return (
    <div className="border-t border-border bg-muted/25">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <MetricGroup title="Price History" accent="history">
          <Metric
            label={rvLabel}
            value={rvDisplay}
            tone={history?.rv20 == null && !indicatorsPending ? "muted" : "default"}
            info={
              indicatorsPending
                ? null
                : history?.rv20 == null
                  ? <p>{history?.unavailableReason ?? "N/A. No verified 20-day history for this instrument."}</p>
                  : <p>{rvTooltip}</p>
            }
          />
          {absChange ? (
            <Metric
              label="1Y Vol Percentile"
              value={pctDisplay}
              tone={percentile == null && !indicatorsPending ? "muted" : "default"}
              info={
                indicatorsPending
                  ? null
                  : percentile == null
                    ? (
                        <p>
                          {history?.unavailableReason ?? "No verified 1Y volatility percentile."}
                        </p>
                      )
                    : <p>Ranks the latest 20D volatility against its past year of observations.</p>
              }
            />
          ) : (
            <Metric
              label="Price Percentile (1Y)"
              value={pctDisplay}
              sublabel="Current price vs. last 12 months"
              tone={percentile == null && !indicatorsPending ? "muted" : "default"}
              info={
                indicatorsPending
                  ? null
                  : percentile == null
                    ? (
                        <p>
                          {history?.unavailableReason ?? "No verified one-year history for this instrument."}
                        </p>
                      )
                    : <p>{pricePercentileTooltip}</p>
              }
            />
          )}
        </MetricGroup>

        <MetricGroup title="Futures Curve" accent="curve" className="border-t border-border sm:border-l sm:border-t-0">
          <Metric
            label="Curve Structure"
            value={curvesPending ? "…" : shape ?? "—"}
            tone={
              shape === "Backwardation"
                ? "pos"
                : shape === "Contango"
                  ? "neg"
                  : shape
                    ? "default"
                    : "muted"
            }
            info={
              curvesPending ? null : (
                <p>
                  Shows whether futures prices rise (contango) or fall (backwardation) across delivery
                  months.
                </p>
              )
            }
          />
          <Metric
            label="Front-Month Spread"
            value={curvesPending ? "…" : spreadValue ?? "—"}
            sublabel={spreadSubtitle ?? undefined}
            tone={
              spreadSigned == null
                ? "muted"
                : spreadSigned > 0
                  ? "pos"
                  : spreadSigned < 0
                    ? "neg"
                    : "default"
            }
            info={
              curvesPending ? null : (
                <p>Price difference between the two nearest listed futures contracts (M1 − M2).</p>
              )
            }
          />
        </MetricGroup>
      </div>
    </div>
  );
}

function MetricGroup({
  title,
  accent,
  className,
  children,
}: {
  title: string;
  accent: "history" | "curve";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={["px-3 py-2.5 sm:px-4", className].filter(Boolean).join(" ")}>
      <div
        className="mb-2 border-l-[3px] pl-2.5"
        style={{ borderLeftColor: VIEW_ACCENTS[accent] }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  sublabel,
  tone = "default",
  info,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "muted" | "pos" | "neg";
  info?: ReactNode;
}) {
  const valueClass =
    tone === "pos"
      ? "text-pos"
      : tone === "neg"
        ? "text-neg"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";

  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-card px-2.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          {sublabel ? (
            <div className="mt-0.5 truncate text-[9px] leading-snug text-muted-foreground/80">{sublabel}</div>
          ) : null}
        </div>
        {info ? <CommodityInfo label={`About ${label}`}>{info}</CommodityInfo> : null}
      </div>
      <div
        className={[
          "mt-1.5 truncate font-mono text-[15px] font-semibold tabular-nums leading-none tracking-tight",
          valueClass,
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function priceHistoryDomain(points: { price: number }[]): [number, number] | ["auto", "auto"] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!(point.price > 0) || !Number.isFinite(point.price)) continue;
    if (point.price < min) min = point.price;
    if (point.price > max) max = point.price;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return ["auto", "auto"];
  const span = max - min;
  const pad = span > 0 ? span * 0.22 : Math.abs(max) * 0.08;
  return [min - pad * 0.35, max + pad];
}

function historyChangeTone(value: number | null): string {
  if (value == null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-emerald-700/90 dark:text-emerald-400/90" : "text-rose-700/90 dark:text-rose-400/90";
}

function PriceHistoryTooltip({
  active,
  payload,
  points,
  unit,
  intraday,
  coordinate,
  viewBox,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { date?: string; price?: number } }>;
  points: { date: string; price: number }[];
  unit: string | null;
  intraday: boolean;
  coordinate?: { x: number; y: number };
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point?.date || point.price == null || !Number.isFinite(point.price)) return null;

  /** First close in the visible chart window (selected range). */
  const periodStart = points[0] ?? null;
  const fromStartPct =
    periodStart != null && periodStart.price !== 0
      ? ((point.price - periodStart.price) / periodStart.price) * 100
      : null;

  const tipSize = { width: 176, height: 92 };
  const anchor = clampChartTooltipAnchor(coordinate, viewBox, tipSize);

  return (
    <div
      style={
        anchor
          ? { position: "absolute", left: anchor.x, top: anchor.y, pointerEvents: "none" }
          : undefined
      }
    >
      <div className="min-w-[168px] rounded-md border border-border/80 bg-card/95 px-2.5 py-2 text-foreground shadow-md backdrop-blur-[2px]">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {intraday ? "Time" : "Session"}
        </div>
        <div className="mt-0.5 text-[12px] font-medium tracking-tight text-foreground">
          {intraday ? formatIntradayStamp(point.date) : formatAsOf(point.date)}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
          <span className="text-[10px] text-muted-foreground">{intraday ? "Price" : "Close"}</span>
          <span className="font-mono text-[12px] font-semibold tabular-nums leading-none">
            {formatPrice(point.price, unit)}
            {unit ? <span className="ml-1 text-[9px] font-normal text-muted-foreground">{unit}</span> : null}
          </span>
        </div>

        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">vs period</span>
          <span
            className={[
              "font-mono text-[11px] tabular-nums leading-none",
              historyChangeTone(fromStartPct),
            ].join(" ")}
          >
            {fromStartPct == null ? "—" : `${formatSigned(fromStartPct, 2)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceChart({
  points,
  unit,
  intraday = false,
}: {
  points: { date: string; price: number }[];
  unit: string | null;
  intraday?: boolean;
}) {
  return (
    <div className="relative min-h-[280px] flex-1">
      <div className="absolute inset-0 px-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.65} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={intraday ? shortIntradayTime : shortDate}
              minTickGap={intraday ? 28 : 36}
              height={56}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={priceHistoryDomain(points)}
              width={64}
              tickFormatter={(value: number) => formatPrice(value, unit)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              label={
                unit
                  ? {
                      value: unit,
                      angle: -90,
                      position: "insideLeft",
                      offset: 12,
                      style: { fontSize: 10, fill: "var(--muted-foreground)", textAnchor: "middle" },
                    }
                  : undefined
              }
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              allowEscapeViewBox={{ x: false, y: false }}
              content={(props) => (
                <PriceHistoryTooltip
                  active={props.active}
                  payload={props.payload as ReadonlyArray<{ payload?: { date?: string; price?: number } }>}
                  points={points}
                  unit={unit}
                  intraday={intraday}
                  coordinate={props.coordinate as { x: number; y: number } | undefined}
                  viewBox={props.viewBox as { x?: number; y?: number; width?: number; height?: number } | undefined}
                />
              )}
            />
            <Line
              type="linear"
              dataKey="price"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 1.5 }}
              isAnimationActive={!intraday}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ViewSwitch({
  view,
  onView,
  curveAvailable,
}: {
  view: ViewId;
  onView: (view: ViewId) => void;
  curveAvailable: boolean;
}) {
  const options = [
    {
      id: "history" as const,
      label: "Price history",
      hint: "Spot / front over time",
      icon: LineChartIcon,
      accent: VIEW_ACCENTS.history,
    },
    {
      id: "curve" as const,
      label: "Futures Curve",
      hint: curveAvailable ? "Term structure by delivery" : "Not available",
      icon: ChartSpline,
      accent: VIEW_ACCENTS.curve,
      disabled: !curveAvailable,
    },
  ];
  return (
    <div
        className="grid w-full grid-cols-2 gap-1.5 rounded-lg border-2 border-foreground/25 bg-muted/50 p-1.5 shadow-sm"
        role="tablist"
        aria-label="Price history or futures curve"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const next: ViewId = view === "history" ? "curve" : "history";
          if (next === "curve" && !curveAvailable) return;
          onView(next);
          const buttons = event.currentTarget.querySelectorAll("button");
          buttons[next === "history" ? 0 : 1]?.focus();
        }}
      >
        {options.map((option) => {
          const active = view === option.id;
          const Icon = option.icon;
          const disabled = option.disabled === true;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              title={
                disabled
                  ? "No verified futures curve for this instrument"
                  : `${option.label} — ${option.hint}`
              }
              onClick={() => {
                if (!disabled) onView(option.id);
              }}
              className={[
                "inline-flex min-w-0 items-center justify-center gap-2.5 rounded-md px-4 py-3.5 text-[15px] font-semibold leading-none tracking-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                disabled
                  ? "cursor-not-allowed bg-muted/40 text-muted-foreground opacity-50"
                  : active
                    ? "bg-card text-foreground shadow-md ring-1 ring-foreground/15"
                    : "bg-transparent text-foreground/80 ring-1 ring-transparent hover:bg-card/70 hover:text-foreground",
              ].join(" ")}
            >
              <Icon
                className={["size-4 shrink-0", disabled ? "text-muted-foreground" : ""].join(" ")}
                strokeWidth={2.5}
                style={disabled ? undefined : { color: option.accent }}
                aria-hidden
              />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  disabled = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={[
        "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed border-transparent text-muted-foreground/45"
          : active
            ? "border-border bg-muted text-foreground"
            : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function EmptyChart({ title, message }: { title?: string; message: string }) {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
      {title ? <p className="text-[13px] font-medium text-foreground">{title}</p> : null}
      <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

function priceSeries(
  quote: CommodityQuote,
  history: HistoryIndicator | null,
): { points: { date: string; price: number }[]; instrument: string } | null {
  if (CHART_FROM_HISTORY_BARS.has(quote.id) && history && history.bars.length >= 2) {
    const avanza = history.ticker.startsWith("Avanza");
    const rollNote =
      !avanza && (quote.kind === "futures" || quote.id === "gold" || quote.id === "silver")
        ? " Continuous front-month series may include roll effects between contract months."
        : "";
    return {
      points: history.bars.map((bar) => ({ date: bar.date, price: bar.close })),
      instrument: `${history.contractLabel}.${rollNote} Same series as 20D realized volatility.`,
    };
  }
  if (quote.chart.length >= 2) {
    return {
      points: quote.chart,
      instrument: [quote.chartLabel, quote.contractLabel].filter(Boolean).join(". "),
    };
  }
  return null;
}

function formatRv20(history: HistoryIndicator | null, pending: boolean): string {
  if (pending) return "…";
  if (history?.rv20 == null) return "N/A";
  if (history.rvKind === "abs_change") {
    return `${history.rv20.toFixed(1)} ${history.unit}`;
  }
  return `${history.rv20.toFixed(1)}%`;
}

function sliceRange(
  points: { date: string; price: number }[],
  range: DailyRangeId,
): { points: { date: string; price: number }[]; partial: boolean } | null {
  if (points.length < 2) return null;
  const need = RANGE_SESSIONS[range];
  if (points.length < need) return { points, partial: true };
  return { points: points.slice(-need), partial: false };
}

/** Calendar-date windows for Nordic SYS (7-day week). Never fabricates missing days. */
function sliceNordicCalendarRange(
  points: { date: string; price: number }[],
  range: NordicChartRangeId,
): { date: string; price: number }[] | null {
  if (points.length < 2) return null;
  if (range === "MAX") return points;
  const latest = points[points.length - 1]!.date;
  const start =
    range === "1W" ? stockholmDateOffset(latest, -6) : stockholmDateOffsetMonths(latest, -1);
  const sliced = points.filter((point) => point.date >= start);
  return sliced.length >= 2 ? sliced : null;
}

const HISTORY_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** e.g. 21 Sep – 24 Nov 2026 (year once when span is within one year). */
function formatNordicHistorySpan(firstDate: string, lastDate: string): string {
  const [y1, m1, d1] = firstDate.split("-").map(Number);
  const [y2, m2, d2] = lastDate.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return `${firstDate} – ${lastDate}`;
  const left =
    y1 === y2
      ? `${d1} ${HISTORY_MONTH_SHORT[m1 - 1]}`
      : `${d1} ${HISTORY_MONTH_SHORT[m1 - 1]} ${y1}`;
  const right = `${d2} ${HISTORY_MONTH_SHORT[m2 - 1]} ${y2}`;
  return `${left} – ${right}`;
}

function instrumentBenchmark(id: string): string {
  return COMMODITY_BENCHMARKS[id] ?? "N/A";
}

function instrumentPricingUnit(id: string): string {
  return COMMODITY_PRICING_UNITS[id] ?? "N/A";
}

function instrumentDetail(quote: CommodityQuote): {
  benchmark: string;
  unit: string;
  updated: string;
} {
  return {
    benchmark: instrumentBenchmark(quote.id),
    unit: instrumentPricingUnit(quote.id),
    updated: formatObservationStockholm(quote.asOf),
  };
}

function rowDetail(quote: CommodityQuote): string {
  const { benchmark, unit, updated } = instrumentDetail(quote);
  return `Benchmark: ${benchmark}\nUnit: ${unit}\nUpdated: ${updated}`;
}

function InstrumentTooltipBody({ quote }: { quote: CommodityQuote }) {
  const { benchmark, unit, updated } = instrumentDetail(quote);
  return (
    <div className="space-y-1">
      <p className="leading-snug">
        <span className="font-semibold">Benchmark:</span> {benchmark}
      </p>
      <p className="leading-snug">
        <span className="font-semibold">Unit:</span> {unit}
      </p>
      <p className="leading-snug">
        <span className="font-semibold">Updated:</span> {updated}
      </p>
    </div>
  );
}

/** Observation time in Europe/Stockholm. Date-only sources stay date-only (no invented clock time). */
function formatObservationStockholm(asOf: string | null): string {
  if (!asOf) return "N/A";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const parsed = new Date(dateOnly ? `${asOf}T12:00:00Z` : asOf);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  if (dateOnly) {
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: STOCKHOLM_TZ,
    });
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: STOCKHOLM_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const zone = stockholmCetLabel(get("timeZoneName"));
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${zone}`;
}

function stockholmCetLabel(offsetOrName: string): string {
  if (offsetOrName === "CET" || offsetOrName === "CEST") return offsetOrName;
  if (/^\+0?2/.test(offsetOrName.replace(/^GMT/i, "").trim()) || offsetOrName.includes("+02")) return "CEST";
  if (/^\+0?1/.test(offsetOrName.replace(/^GMT/i, "").trim()) || offsetOrName.includes("+01")) return "CET";
  return offsetOrName || "CET";
}

function formatPrice(price: number, unit: string | null): string {
  const digits = unit === "USD/MMBtu" ? 3 : 2;
  return price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatSigned(value: number, digits: number): string {
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function formatPercent(change: number): string {
  const abs = Math.abs(change).toFixed(2);
  if (change > 0) return `+${abs}%`;
  if (change < 0) return `−${abs}%`;
  return `${abs}%`;
}

function percentClass(change: number | null): string {
  if (change == null || !Number.isFinite(change)) return "text-muted-foreground";
  if (change > 0.005) return "text-pos-lite";
  if (change < -0.005) return "text-neg-lite";
  return "text-muted-foreground";
}

function formatAsOf(asOf: string | null): string {
  if (!asOf) return "N/A";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const parsed = new Date(dateOnly ? `${asOf}T00:00:00Z` : asOf);
  if (Number.isNaN(parsed.getTime())) return asOf;
  if (dateOnly) {
    return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  const stamp = parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${stamp} UTC`;
}

/** Local timezone stamp for intraday hover. */
function formatIntradayStamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shortDate(iso: string): string {
  const dayPart = iso.includes("T") ? iso.slice(0, 10) : iso;
  const [, month, day] = dayPart.split("-");
  if (!month || !day) return iso;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)} ${names[Number(month) - 1] ?? month}`;
}

function shortIntradayTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}
