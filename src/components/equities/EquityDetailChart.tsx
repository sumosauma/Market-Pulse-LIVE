import { useId, useMemo, useRef } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { mapPctColor } from "@/lib/equities/equityMapStyle";
import {
  computeChartYScale,
  fmtChartAxisLabel,
  fmtChartAxisPrice,
  mapX,
  mapY,
  pickChartXTickIndices,
  pickIntradayXTickIndices,
  type ChartAxisLabelMode,
} from "@/lib/equities/equityChartScale";
import { fmtExchangeTime, type ExchangeTz } from "@/lib/equities/equityExchangeTz";

const VIEW_W_MIN = 640;
const VIEW_H = 260;
const CHART_H = "h-[260px]";
const PLOT = { left: 28, top: 14, right: 44, bottom: 24 };

/** Compact institutional chart with dashed price-level guides and date axis. */
export function EquityDetailChart({
  values,
  dates,
  dateLabelMode = "date",
  exchangeTz,
  changePercent,
  axisDigits,
  className,
}: {
  values: readonly number[];
  dates?: readonly string[];
  dateLabelMode?: ChartAxisLabelMode;
  /** Exchange-local time labels for 1D intraday charts. */
  exchangeTz?: ExchangeTz;
  changePercent: number | null;
  axisDigits?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(containerRef);
  const viewW =
    containerWidth > 0 ? Math.max(VIEW_W_MIN, Math.round(containerWidth)) : VIEW_W_MIN;

  const gradientId = useId().replace(/:/g, "");
  const lineColor = mapPctColor(changePercent);

  const model = useMemo(() => {
    if (values.length < 2) return null;

    const plotW = viewW - PLOT.left - PLOT.right;
    const plotH = VIEW_H - PLOT.top - PLOT.bottom;
    const yScale = computeChartYScale(values, 4);

    const hasDates = dates && dates.length === values.length;

    const points = values.map((value, index) => ({
      x: mapX(index, values.length, PLOT.left, plotW),
      y: mapY(value, yScale, PLOT.top, plotH),
    }));

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${(PLOT.top + plotH).toFixed(2)} L${points[0].x.toFixed(2)},${(PLOT.top + plotH).toFixed(2)} Z`;

    const gridLines = yScale.ticks.map((tick) => ({
      tick,
      y: mapY(tick, yScale, PLOT.top, plotH),
      label: fmtChartAxisPrice(tick, axisDigits),
    }));

    const formatXLabel = (iso: string) =>
      dateLabelMode === "time" && exchangeTz
        ? fmtExchangeTime(iso, exchangeTz)
        : fmtChartAxisLabel(iso, dateLabelMode);

    const xTicks = hasDates
      ? (() => {
          const indices =
            dateLabelMode === "time"
              ? pickIntradayXTickIndices(values.length)
              : pickChartXTickIndices(values.length, 5);
          return indices.map((index, tickPos) => ({
            key: `idx-${index}`,
            index,
            x: points[index].x,
            label: formatXLabel(dates![index]),
            textAnchor:
              tickPos === 0
                ? ("start" as const)
                : tickPos === indices.length - 1
                  ? ("end" as const)
                  : ("middle" as const),
          }));
        })()
      : [];

    const xBaseline = PLOT.top + plotH;

    return { linePath, areaPath, gridLines, plotW, xTicks, xBaseline, viewW };
  }, [values, dates, dateLabelMode, exchangeTz, viewW, axisDigits]);

  if (!model) {
    return (
      <div
        ref={containerRef}
        className={`flex ${CHART_H} items-center justify-center text-[11px] text-muted-foreground ${className ?? ""}`}
      >
        Chart unavailable
      </div>
    );
  }

  const fillTop = changePercent !== null && changePercent >= 0
    ? "rgba(34, 197, 94, 0.08)"
    : changePercent !== null && changePercent < 0
      ? "rgba(239, 68, 68, 0.08)"
      : "rgba(100, 116, 139, 0.06)";

  const labelStyle = { fontSize: "9.5px", fontFamily: "ui-monospace, monospace" };

  return (
    <div ref={containerRef} className={`${CHART_H} w-full ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${model.viewW} ${VIEW_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price chart"
      >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {model.gridLines.map(({ tick, y }) => (
        <line
          key={tick}
          x1={PLOT.left}
          y1={y}
          x2={PLOT.left + model.plotW}
          y2={y}
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth={0.75}
          strokeDasharray="4 4"
        />
      ))}

      <path d={model.areaPath} fill={`url(#${gradientId})`} stroke="none" />

      <path
        d={model.linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {model.gridLines.map(({ tick, y, label }) => (
        <text
          key={`y-${tick}`}
          x={model.viewW - 4}
          y={y}
          textAnchor="end"
          dominantBaseline="middle"
          fill="#94a3b8"
          className="select-none opacity-70"
          style={labelStyle}
        >
          {label}
        </text>
      ))}

      {model.xTicks.map(({ key, x, label, textAnchor }) => (
        <g key={`x-${key}`}>
          <line
            x1={x}
            y1={model.xBaseline}
            x2={x}
            y2={model.xBaseline + 3}
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth={0.75}
          />
          <text
            x={x}
            y={VIEW_H - 5}
            textAnchor={textAnchor}
            dominantBaseline="auto"
            fill="#94a3b8"
            className="select-none opacity-70"
            style={labelStyle}
          >
            {label}
          </text>
        </g>
      ))}
      </svg>
    </div>
  );
}
