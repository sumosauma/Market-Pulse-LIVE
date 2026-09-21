import { mapXByTime, pickChartTimeTicks } from "@/lib/equities/equityChartScale";

interface SparklineProps {
  values: number[];
  /** ISO date or datetime — one per value; enables time-accurate X-axis when length matches. */
  dates?: readonly string[];
  width?: number;
  height?: number;
  className?: string;
  /** Stretch to fill container (detail panels). Default preserves aspect ratio. */
  cover?: boolean;
}

const X_AXIS_H = 14;
const LABEL_STYLE = { fontSize: "8.5px", fontFamily: "ui-monospace, monospace" };

export function Sparkline({
  values,
  dates,
  width = 84,
  height = 26,
  className,
  cover,
}: SparklineProps) {
  if (!values.length || values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={cover ? "none" : "xMidYMid meet"}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const useTimeAxis = dates != null && dates.length === values.length;
  const showXAxis = useTimeAxis;
  const xAxisH = showXAxis ? X_AXIS_H : 0;
  const padY = 2;
  const chartBottom = height - xAxisH;
  const innerH = chartBottom - padY * 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const pts = values.map((v, i) => {
    const x = useTimeAxis ? mapXByTime(i, dates, 0, width) : i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaD = `${d} L${pts[pts.length - 1]![0].toFixed(1)},${chartBottom.toFixed(1)} L${pts[0]![0].toFixed(1)},${chartBottom.toFixed(1)} Z`;

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "rgb(16 185 129)" : "rgb(244 63 94)";
  const fill = up ? "rgb(16 185 129 / 0.15)" : "rgb(244 63 94 / 0.15)";

  const xTicks = useTimeAxis && dates ? pickChartTimeTicks(dates, 0, width, 3) : [];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={cover ? "none" : "xMidYMid meet"}
      className={className}
      aria-hidden="true"
    >
      {showXAxis ? (
        <line
          x1={0}
          y1={chartBottom}
          x2={width}
          y2={chartBottom}
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth={0.75}
        />
      ) : null}

      <path d={areaD} fill={fill} stroke="none" />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={1.8} fill={stroke} />

      {xTicks.map(({ key, x, label, textAnchor }) => (
        <g key={`x-${key}`}>
          <line
            x1={x}
            y1={chartBottom}
            x2={x}
            y2={chartBottom + 2.5}
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth={0.75}
          />
          <text
            x={x}
            y={height - 2}
            textAnchor={textAnchor}
            dominantBaseline="auto"
            fill="#94a3b8"
            className="select-none opacity-70"
            style={LABEL_STYLE}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
