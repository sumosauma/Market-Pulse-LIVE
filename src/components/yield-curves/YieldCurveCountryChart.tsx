import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YieldCurveCountryCompareRow, YieldPointSourceType } from "@/lib/yieldCurves/types";
import { computeSharedYieldYDomain } from "@/lib/yieldCurves/curveComparison";
import { YIELD_SOURCE_TYPE_LABEL } from "@/lib/yieldCurves/sourceTypeUi";
import { YieldCurveChartLegend } from "./YieldCurveChartLegend";
import { YieldCurveSourceLegend } from "./YieldCurveSourceLegend";
import { YC_AXIS_TICK, YC_CHART_HEIGHT, YC_CHART_MARGIN } from "./yieldCurvePageUi";

function fmtPct(y: number): string {
  return y.toFixed(2);
}

function CountryTooltip(
  props: unknown,
  primaryLabel: string,
  compareLabel: string,
) {
  const p = props as {
    active?: boolean;
    label?: unknown;
    payload?: ReadonlyArray<{
      name?: unknown;
      value?: unknown;
      color?: string;
      dataKey?: string | number;
      payload?: {
        primarySourceType?: YieldPointSourceType;
        compareSourceType?: YieldPointSourceType;
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
          const isPrimary = entry.dataKey === "primary" || nm === primaryLabel;
          const srcType = isPrimary ? rowPayload?.primarySourceType : rowPayload?.compareSourceType;
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
  variant,
}: {
  cx?: number;
  cy?: number;
  sourceType: YieldPointSourceType;
  variant: "primary" | "compare";
}) {
  if (cx === undefined || cy === undefined) return <g />;
  if (sourceType === "missing" || sourceType === "unavailable") return <g />;
  const stroke = variant === "primary" ? "var(--primary)" : "var(--muted-foreground)";
  const fill = variant === "primary" ? "var(--primary)" : "var(--card)";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={fill}
      stroke={stroke}
      strokeWidth={variant === "primary" ? 1 : 1.5}
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
  rows: YieldCurveCountryCompareRow[];
}) {
  if (x === undefined || y === undefined) return null;
  const label = String(payload?.value ?? "");
  const row = rows.find((r) => r.maturity === label);
  const muted =
    row?.primarySourceType === "missing" ||
    row?.primarySourceType === "unavailable" ||
    row?.compareSourceType === "missing" ||
    row?.compareSourceType === "unavailable";

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
  variant = "primary",
}: {
  cx?: number;
  cy?: number;
  sourceType: YieldPointSourceType;
  variant?: "primary" | "compare";
}) {
  if (cx === undefined || cy === undefined || sourceType === "missing" || sourceType === "unavailable") {
    return <g />;
  }
  const fill = variant === "compare" ? "var(--muted-foreground)" : "var(--primary)";
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="var(--card)" strokeWidth={1.5} />;
}

export function YieldCurveCountryChart({
  rows,
  primaryLabel,
  compareLabel,
  periodLabel = "current levels",
}: {
  rows: YieldCurveCountryCompareRow[];
  primaryLabel: string;
  compareLabel: string;
  /** Accepted so a compare fetch can stay quiet in the legend while the page spinner is showing. */
  compareLoading?: boolean;
  periodLabel?: string;
}) {
  const data = rows.map((r) => ({
    maturity: r.maturity,
    primary: r.primaryYield,
    compare: r.compareYield,
    primarySourceType: r.primarySourceType,
    compareSourceType: r.compareSourceType,
  }));

  const yDomain = computeSharedYieldYDomain(rows.flatMap((r) => [r.primaryYield, r.compareYield]));
  const compareLegendLabel = compareLabel;

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
            <Tooltip
              content={(p) => CountryTooltip(p, primaryLabel, compareLabel)}
            />
            <Line
              type="monotone"
              connectNulls
              dataKey="primary"
              name={primaryLabel}
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
                    sourceType={row?.primarySourceType ?? "missing"}
                    variant="primary"
                  />
                );
              }}
              activeDot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                const row = rows[dotProps.index ?? 0];
                return (
                  <ActiveCurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.primarySourceType ?? "missing"}
                    variant="primary"
                  />
                );
              }}
            />
            <Line
              type="monotone"
              connectNulls
              dataKey="compare"
              name={compareLegendLabel}
              stroke="var(--muted-foreground)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              legendType="none"
              dot={(dotProps) => {
                const idx = dotProps.index ?? 0;
                const row = rows[idx];
                return (
                  <CurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.compareSourceType ?? "missing"}
                    variant="compare"
                  />
                );
              }}
              activeDot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                const row = rows[dotProps.index ?? 0];
                return (
                  <ActiveCurveDot
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    sourceType={row?.compareSourceType ?? "missing"}
                    variant="compare"
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <YieldCurveChartLegend
        items={[
          { label: primaryLabel, color: "var(--primary)" },
          { label: compareLegendLabel, color: "var(--muted-foreground)", dashed: true },
        ]}
      />
      <div className="border-t border-border/40 px-4 py-2">
        <p className="text-center text-[11px] text-muted-foreground">
          Shared yield scale · {periodLabel} · {primaryLabel} minus {compareLabel} spread in table
          below
        </p>
        <YieldCurveSourceLegend />
      </div>
    </div>
  );
}
