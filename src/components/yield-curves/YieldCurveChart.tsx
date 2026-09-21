import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YieldCurveRowView, YieldPointSourceType } from "@/lib/yieldCurves/types";
import { computeAutoYieldYDomain, type YieldChartScaleMode } from "@/lib/yieldCurves/curveComparison";
import { YIELD_SOURCE_TYPE_LABEL } from "@/lib/yieldCurves/sourceTypeUi";
import { YieldCurveChartLegend } from "./YieldCurveChartLegend";
import { YieldCurveSourceLegend } from "./YieldCurveSourceLegend";
import { YC_AXIS_TICK, YC_CHART_HEIGHT, YC_CHART_MARGIN } from "./yieldCurvePageUi";

function fmtPct(y: number): string {
  return y.toFixed(2);
}

function YieldCurveTooltip(props: unknown) {
  const p = props as {
    active?: boolean;
    label?: unknown;
    payload?: ReadonlyArray<{
      name?: unknown;
      value?: unknown;
      color?: string;
      payload?: {
        currentSourceType?: YieldPointSourceType;
        comparisonSourceType?: YieldPointSourceType;
      };
    }>;
  };

  const { active, payload, label } = p ?? {};
  if (!active || !payload?.length) return null;

  const rowPayload = payload[0]?.payload;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 text-[12px] shadow-md">
      <div className="mb-2 font-semibold text-foreground">{String(label ?? "")}</div>
      <div className="flex flex-col gap-1.5 font-mono">
        {payload.map((entry, i) => {
          const nm = typeof entry.name === "string" ? entry.name : String(entry.name ?? "");
          const raw = entry.value;
          let text = "—";
          if (raw !== null && raw !== undefined && raw !== "") {
            const v = typeof raw === "number" ? raw : Number(raw);
            if (Number.isFinite(v)) text = `${fmtPct(v)}%`;
          }
          const isCurrent = nm.toLowerCase().includes("current");
          const srcType = isCurrent
            ? rowPayload?.currentSourceType
            : rowPayload?.comparisonSourceType;
          const srcLabel = srcType ? YIELD_SOURCE_TYPE_LABEL[srcType] : "";
          const color =
            typeof entry.color === "string" && entry.color.length ? entry.color : "currentColor";

          return (
            <div key={i} className="tabular-nums" style={{ color }}>
              <span className="text-muted-foreground">{nm}</span>
              <span className="ml-2 font-medium">{text}</span>
              {srcLabel ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">({srcLabel})</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CurveDot({
  cx,
  cy,
  sourceType,
}: {
  cx?: number;
  cy?: number;
  sourceType: YieldPointSourceType;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  if (sourceType === "missing" || sourceType === "unavailable") return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="var(--primary)"
      stroke="var(--primary)"
      strokeWidth={1}
    />
  );
}

function ComparisonCurveDot({
  cx,
  cy,
  sourceType,
}: {
  cx?: number;
  cy?: number;
  sourceType: YieldPointSourceType;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  if (sourceType === "missing" || sourceType === "unavailable") return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill="var(--card)"
      stroke="var(--muted-foreground)"
      strokeWidth={1.5}
    />
  );
}

function MaturityAxisTick({
  x,
  y,
  payload,
  rows,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  rows: YieldCurveRowView[];
}) {
  if (x === undefined || y === undefined) return null;
  const label = String(payload?.value ?? "");
  const row = rows.find((r) => r.maturity === label);
  const muted =
    row?.current.sourceType === "missing" || row?.current.sourceType === "unavailable";

  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fill="var(--muted-foreground)"
      opacity={muted ? 0.5 : 0.9}
      fontStyle={muted ? "italic" : "normal"}
      fontFamily="ui-monospace, monospace"
    >
      {label}
    </text>
  );
}

function ActiveCurveDot({
  cx,
  cy,
  sourceType,
  variant = "current",
}: {
  cx?: number;
  cy?: number;
  sourceType: YieldPointSourceType;
  variant?: "current" | "comparison";
}) {
  if (cx === undefined || cy === undefined || sourceType === "missing" || sourceType === "unavailable") {
    return <g />;
  }
  const fill = variant === "comparison" ? "var(--muted-foreground)" : "var(--primary)";
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="var(--card)" strokeWidth={1.5} />;
}

export function YieldCurveChart({
  rows,
  comparisonName,
  scaleMode = "auto",
}: {
  rows: YieldCurveRowView[];
  comparisonName: string;
  scaleMode?: YieldChartScaleMode;
}) {
  const data = rows.map((r) => ({
    maturity: r.maturity,
    current: r.currentYield,
    comparison: r.comparisonYield,
    currentSourceType: r.current.sourceType,
    comparisonSourceType: r.comparison.sourceType,
  }));

  const yDomain =
    scaleMode === "auto"
      ? computeAutoYieldYDomain(rows.flatMap((r) => [r.currentYield, r.comparisonYield]))
      : undefined;

  return (
    <div className="w-full min-w-0">
      <div className="px-3 pt-3" style={{ height: YC_CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={YC_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.65} vertical={false} />
            <XAxis
              dataKey="maturity"
              tick={(tickProps) => <MaturityAxisTick {...tickProps} rows={rows} />}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              height={36}
              interval={0}
            />
            <YAxis
              domain={yDomain ?? ["auto", "auto"]}
              tickFormatter={(v) => `${Number(v).toFixed(2)}%`}
              tick={YC_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={54}
              label={{
                value: "Yield %",
                angle: -90,
                position: "insideLeft",
                offset: 8,
                style: { fontSize: 10, fill: "var(--muted-foreground)", textAnchor: "middle" },
              }}
            />
            <Tooltip content={YieldCurveTooltip} />
            <Line
              type="monotone"
              connectNulls
              dataKey="current"
              name="Current curve"
              stroke="var(--primary)"
              strokeWidth={2}
              legendType="none"
              dot={(dotProps) => {
                const idx = dotProps.index ?? 0;
                const row = rows[idx];
                return (
                  <CurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.current.sourceType ?? "missing"}
                  />
                );
              }}
              activeDot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                const row = rows[dotProps.index ?? 0];
                return (
                  <ActiveCurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.current.sourceType ?? "missing"}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              connectNulls
              dataKey="comparison"
              name={comparisonName}
              stroke="var(--muted-foreground)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              legendType="none"
              dot={(dotProps) => {
                const idx = dotProps.index ?? 0;
                const row = rows[idx];
                return (
                  <ComparisonCurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.comparison.sourceType ?? "missing"}
                  />
                );
              }}
              activeDot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                const row = rows[dotProps.index ?? 0];
                return (
                  <ActiveCurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.comparison.sourceType ?? "missing"}
                    variant="comparison"
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <YieldCurveChartLegend
        items={[
          { label: "Current curve", color: "var(--primary)" },
          { label: comparisonName, color: "var(--muted-foreground)", dashed: true },
        ]}
      />
      <div className="border-t border-border/40 px-4 py-2">
        <p className="text-center text-[11px] text-muted-foreground">
          Yields in percent · Basis-point changes in table below
        </p>
        <YieldCurveSourceLegend />
      </div>
    </div>
  );
}
