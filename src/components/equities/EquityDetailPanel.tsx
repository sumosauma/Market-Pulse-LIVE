import { useEffect, useRef, useState } from "react";
import { EquityDetailChart } from "@/components/equities/EquityDetailChart";
import { fmtChangePct, fmtEquityPrice } from "@/lib/equities/equityMarketsUi";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import type { ChartAxisLabelMode } from "@/lib/equities/equityChartScale";
import { exchangeLocalDateKey, exchangeTzFromRow, type ExchangeTz } from "@/lib/equities/equityExchangeTz";
import { intradayLastSession } from "@/lib/equities/equityIntradaySession";
import {
  change1dPercentForRow,
  change1mPercent,
  changeOverTradingDays,
  lastEquityPrice,
} from "@/lib/equities/equityDayChange";
import type { EquityHistoryPoint, EquityMarketRow } from "@/lib/equities/types";

type ChartRange = "1D" | "5D" | "1M" | "1Y";

const CHART_RANGE_PRIORITY: readonly ChartRange[] = ["1D", "5D", "1M", "1Y"];

/** First chart range with enough data — prefer 1D, then 5D, 1M, 1Y. */
function firstAvailableChartRange(row: EquityMarketRow): ChartRange {
  for (const range of CHART_RANGE_PRIORITY) {
    if (chartForRange(row, range) !== null) return range;
  }
  return "1M";
}

function isChartRangeAvailable(row: EquityMarketRow, range: ChartRange): boolean {
  return chartForRange(row, range) !== null;
}

/** ~1 month of trading days on the 1M chart view. */
const CHART_TRADING_DAYS = 23;

function pointsToSeries(points: readonly EquityHistoryPoint[]): { values: number[]; dates: string[] } {
  return { values: points.map((p) => p.price), dates: points.map((p) => p.date) };
}

function chartForRange(
  row: EquityMarketRow,
  range: ChartRange,
): {
  values: number[];
  dates?: string[];
  labelMode: ChartAxisLabelMode;
  exchangeTz?: ExchangeTz;
} | null {
  const history = row.history ?? [];
  const intraday = row.intraday ?? [];
  const exchangeTz = exchangeTzFromRow(row);

  switch (range) {
    case "1D": {
      const session = intradayLastSession(intraday, exchangeTz);
      if (session.length >= 2) {
        return {
          ...pointsToSeries(session),
          labelMode: "time",
          exchangeTz,
        };
      }
      return null;
    }
    case "5D": {
      if (history.length < 6) return null;
      const slice = history.slice(-6);
      const last = lastEquityPrice(row);
      const lastDailyClose = slice[slice.length - 1].price;
      if (last !== null && last !== lastDailyClose) {
        const todayKey = exchangeLocalDateKey(new Date().toISOString(), exchangeTz);
        return {
          ...pointsToSeries([...slice, { date: todayKey, price: last }]),
          labelMode: "date",
        };
      }
      return { ...pointsToSeries(slice), labelMode: "date" };
    }
    case "1M": {
      const daily = history.length <= CHART_TRADING_DAYS ? history : history.slice(-CHART_TRADING_DAYS);
      if (daily.length >= 2) {
        return { ...pointsToSeries(daily), labelMode: "date" };
      }
      return null;
    }
    case "1Y": {
      if (history.length >= 2) {
        return { ...pointsToSeries(history), labelMode: "date" };
      }
      return null;
    }
  }
}

/** 1Y % — uses up to 252 sessions; adapts when Yahoo returns slightly fewer bars. */
function change1yPercent(row: EquityMarketRow): number | null {
  const history = row.history ?? [];
  if (history.length < 22) return null;
  return changeOverTradingDays(row, Math.min(252, history.length - 1));
}

/** 5D % from daily history — same window and availability as the 5D chart. */
function change5dPercent(row: EquityMarketRow): number | null {
  return changeOverTradingDays(row, 5);
}

function RangeStat({
  label,
  value,
  active,
  onSelect,
  hideIfNull = false,
  disabled = false,
}: {
  label: ChartRange;
  value: number | null;
  active: boolean;
  onSelect: () => void;
  hideIfNull?: boolean;
  disabled?: boolean;
}) {
  if (hideIfNull && value === null) return null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors",
        active ? "bg-muted/45 ring-1 ring-border/50" : "hover:bg-muted/25",
        disabled ? "cursor-not-allowed opacity-45 hover:bg-transparent" : "",
      ].join(" ")}
    >
      <span className={`font-mono text-[15px] font-semibold tabular-nums ${changePctClass(value)}`}>
        {fmtChangePct(value)}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </button>
  );
}

function DayExtreme({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-[14px] font-medium tabular-nums text-muted-foreground">
        {fmtEquityPrice(value ?? null)}
      </span>
    </span>
  );
}

export function EquityDetailPanel({
  row,
  onClear,
}: {
  row: EquityMarketRow | null;
  onClear: () => void;
}) {
  const [chartRange, setChartRange] = useState<ChartRange>("1D");
  const prevCountryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!row) {
      prevCountryIdRef.current = null;
      return;
    }

    const marketChanged = prevCountryIdRef.current !== row.countryId;
    prevCountryIdRef.current = row.countryId;

    setChartRange((current) => {
      if (marketChanged) return firstAvailableChartRange(row);
      if (isChartRangeAvailable(row, current)) return current;
      return firstAvailableChartRange(row);
    });
  }, [row, row?.countryId, row?.intraday?.length, row?.history?.length]);

  if (!row) {
    return (
      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <p className="text-[12px] font-medium text-foreground">Select a market</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Click a market chip or country on the map to view index details, 1D performance, and data status.
        </p>
      </div>
    );
  }

  const change1d = change1dPercentForRow(row);
  const change5d = change5dPercent(row);
  const change1m = change1mPercent(row);
  const change1y = change1yPercent(row);

  const activeChart = chartForRange(row, chartRange);
  const chartChangePercent =
    chartRange === "1D"
      ? change1d
      : chartRange === "5D"
        ? change5d
        : chartRange === "1M"
          ? change1m
          : change1y;

  const rangeDisabled = (range: ChartRange) => chartForRange(row, range) === null;

  return (
    <div className="px-4 py-5 sm:px-5 sm:py-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="ml-1.5 flex min-w-0 flex-1 items-start gap-2.5 sm:ml-2">
          <EquityCountryFlag countryId={row.countryId} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold leading-tight text-foreground sm:text-[17px]">
              {row.countryName}
            </p>
            <p className="mt-0.5 truncate text-[13px] leading-snug text-muted-foreground sm:text-[14px]">
              {row.indexName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {row.source ? (
            <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              {row.source}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            Clear selection
          </button>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-2">
          <span className="font-mono text-[22px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
            {fmtEquityPrice(row.price)}
          </span>
          <DayExtreme label="Low" value={row.dayLow} />
          <DayExtreme label="High" value={row.dayHigh} />
        </div>

        <div className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
          <RangeStat
            label="1D"
            value={change1d}
            active={chartRange === "1D"}
            onSelect={() => setChartRange("1D")}
            disabled={rangeDisabled("1D")}
          />
          <RangeStat
            label="5D"
            value={change5d}
            active={chartRange === "5D"}
            onSelect={() => setChartRange("5D")}
            disabled={rangeDisabled("5D")}
          />
          <RangeStat
            label="1M"
            value={change1m}
            active={chartRange === "1M"}
            onSelect={() => setChartRange("1M")}
            disabled={rangeDisabled("1M")}
          />
          <RangeStat
            label="1Y"
            value={change1y}
            active={chartRange === "1Y"}
            onSelect={() => setChartRange("1Y")}
            disabled={rangeDisabled("1Y")}
          />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-md bg-muted/8 ring-1 ring-border/30">
        {activeChart ? (
          <EquityDetailChart
            values={activeChart.values}
            dates={activeChart.dates}
            dateLabelMode={activeChart.labelMode}
            exchangeTz={activeChart.exchangeTz}
            changePercent={chartChangePercent}
          />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-[11px] text-muted-foreground">
            Chart unavailable for this range
          </div>
        )}
      </div>

      {row.error ? (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">{row.error}</p>
      ) : null}
    </div>
  );
}
