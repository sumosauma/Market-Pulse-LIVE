import { useState } from "react";
import { Info } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatVolPct } from "@/lib/derivatives/format";
import {
  computeVolTermYDomain,
  displayVolTermShape,
  VOL_TERM_EXPLAINER,
  VOL_TERM_METHODOLOGY_NOTE,
  type VolTermStructurePayload,
} from "@/lib/derivatives/volTermStructure";

const CHART_HEIGHT = 268;
const CHART_MARGIN = { top: 12, right: 20, left: 4, bottom: 2 } as const;
const AXIS_TICK = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
  fontFamily: "ui-monospace, monospace",
} as const;

const SPX_COLOR = "var(--primary)";
const SX5E_COLOR = "var(--muted-foreground)";

function formatAsOf(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

function TermTooltip(
  props: unknown,
  asOf: string | null,
) {
  const p = props as {
    active?: boolean;
    label?: unknown;
    payload?: ReadonlyArray<{
      name?: unknown;
      value?: unknown;
      color?: string;
    }>;
  };
  const { active, payload, label } = p ?? {};
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 text-[12px] shadow-md">
      <div className="mb-1.5 font-semibold text-foreground">{String(label ?? "")}</div>
      <div className="mb-2 text-[10px] text-muted-foreground">As of {formatAsOf(asOf)}</div>
      <div className="flex flex-col gap-1.5 font-mono">
        {payload.map((entry, i) => {
          const nm = typeof entry.name === "string" ? entry.name : String(entry.name ?? "");
          const raw = entry.value;
          let text = "—";
          if (raw !== null && raw !== undefined && raw !== "") {
            const v = typeof raw === "number" ? raw : Number(raw);
            if (Number.isFinite(v)) text = formatVolPct(v);
          }
          const color =
            typeof entry.color === "string" && entry.color.length ? entry.color : "currentColor";
          return (
            <div key={i} className="tabular-nums" style={{ color }}>
              <span className="text-muted-foreground">{nm}</span>
              <span className="ml-2 font-medium text-foreground">{text}</span>
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
  variant,
}: {
  cx?: number;
  cy?: number;
  variant: "spx" | "sx5e";
}) {
  if (cx === undefined || cy === undefined) return <g />;
  const stroke = variant === "spx" ? SPX_COLOR : SX5E_COLOR;
  const fill = variant === "spx" ? SPX_COLOR : "var(--card)";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={fill}
      stroke={stroke}
      strokeWidth={variant === "spx" ? 1 : 1.5}
    />
  );
}

export function VolTermStructureChart({
  payload,
  isLoading,
}: {
  payload: VolTermStructurePayload | undefined;
  isLoading: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const rows = payload?.chartRows ?? null;
  const asOf = payload?.asOf ?? null;
  const yDomain = rows ? computeVolTermYDomain(rows.flatMap((r) => [r.spx, r.sx5e])) : undefined;
  const unavailable = !isLoading && (!rows || payload?.unavailableReason);

  return (
    <div className="w-full min-w-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">S&P 500 vs EURO STOXX 50</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Official EOD · common as-of {isLoading && !payload ? "…" : formatAsOf(asOf)}
          </p>
        </div>
        <TooltipProvider delayDuration={200}>
          <UiTooltip open={infoOpen} onOpenChange={setInfoOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label={VOL_TERM_EXPLAINER}
                onClick={() => setInfoOpen((v) => !v)}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="max-w-[340px] border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-relaxed text-foreground"
            >
              <p>{VOL_TERM_EXPLAINER}</p>
              <p className="mt-2">{VOL_TERM_METHODOLOGY_NOTE}</p>
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </div>

      {isLoading && !rows ? (
        <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
          Loading official EOD term structure…
        </p>
      ) : unavailable ? (
        <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
          {payload?.unavailableReason ?? "Implied volatility term structure unavailable."}
        </p>
      ) : (
        <div className="px-3 pt-2 pb-0" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows ?? []} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.65} vertical={false} />
              <XAxis
                dataKey="maturity"
                tick={AXIS_TICK}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                height={26}
                interval={0}
              />
              <YAxis
                domain={yDomain ?? ["auto", "auto"]}
                tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={54}
                label={{
                  value: "Annualized IV %",
                  angle: -90,
                  position: "insideLeft",
                  offset: 8,
                  style: { fontSize: 10, fill: "var(--muted-foreground)", textAnchor: "middle" },
                }}
              />
              <Tooltip content={(p) => TermTooltip(p, asOf)} />
              <Line
                type="monotone"
                dataKey="spx"
                name="S&P 500"
                stroke={SPX_COLOR}
                strokeWidth={2}
                legendType="none"
                isAnimationActive={false}
                dot={(dotProps) => <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="spx" />}
                activeDot={{ r: 4, fill: SPX_COLOR, stroke: "var(--card)", strokeWidth: 1.5 }}
              />
              <Line
                type="monotone"
                dataKey="sx5e"
                name="EURO STOXX 50"
                stroke={SX5E_COLOR}
                strokeDasharray="6 4"
                strokeWidth={1.5}
                legendType="none"
                isAnimationActive={false}
                dot={(dotProps) => <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="sx5e" />}
                activeDot={{ r: 4, fill: SX5E_COLOR, stroke: "var(--card)", strokeWidth: 1.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-col items-center justify-center gap-8 px-4 pb-5 pt-1 sm:flex-row sm:items-start sm:gap-36">
        <CurveSummary
          label="S&P 500"
          variant="spx"
          oneMonth={payload?.spx?.oneMonth ?? null}
          oneYear={payload?.spx?.oneYear ?? null}
          shape={payload?.spx?.shape ?? null}
          pending={isLoading && !payload}
        />
        <CurveSummary
          label="EURO STOXX 50"
          variant="sx5e"
          oneMonth={payload?.sx5e?.oneMonth ?? null}
          oneYear={payload?.sx5e?.oneYear ?? null}
          shape={payload?.sx5e?.shape ?? null}
          pending={isLoading && !payload}
        />
      </div>
    </div>
  );
}

function curveShapeTone(label: string): string {
  if (label === "Contango") return "text-emerald-700 dark:text-emerald-400";
  if (label === "Backwardation") return "text-amber-800 dark:text-amber-400";
  return "text-foreground";
}

function CurveLineSwatch({ variant }: { variant: "spx" | "sx5e" }) {
  const stroke = variant === "spx" ? SPX_COLOR : SX5E_COLOR;
  return (
    <svg width="44" height="12" aria-hidden className="mx-auto mt-1.5 block">
      <line
        x1="0"
        y1="6"
        x2="44"
        y2="6"
        stroke={stroke}
        strokeWidth={variant === "spx" ? 2.5 : 2}
        strokeDasharray={variant === "spx" ? undefined : "6 3.5"}
      />
    </svg>
  );
}

function CurveSummary({
  label,
  variant,
  oneMonth,
  oneYear,
  shape,
  pending,
}: {
  label: string;
  variant: "spx" | "sx5e";
  oneMonth: number | null;
  oneYear: number | null;
  shape: string | null;
  pending: boolean;
}) {
  const shapeLabel = pending ? "…" : displayVolTermShape(shape);
  return (
    <div className="min-w-max text-center">
      <div className="text-[15px] font-semibold tracking-tight text-foreground">{label}</div>
      <CurveLineSwatch variant={variant} />
      <div className="mt-2 flex items-baseline justify-center gap-x-2.5 whitespace-nowrap font-mono text-[18px] font-semibold tabular-nums tracking-tight text-foreground">
        {pending ? (
          <span className="text-muted-foreground">…</span>
        ) : (
          <>
            <span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                1M{" "}
              </span>
              {formatVolPct(oneMonth)}
            </span>
            <span className="text-[14px] font-medium text-muted-foreground" aria-hidden>
              →
            </span>
            <span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                1Y{" "}
              </span>
              {formatVolPct(oneYear)}
            </span>
          </>
        )}
      </div>
      <div className="mt-2 text-[13px] leading-snug">
        <span className="font-medium text-muted-foreground">Curve:</span>{" "}
        <span className={["font-semibold", pending ? "text-muted-foreground" : curveShapeTone(shapeLabel)].join(" ")}>
          {shapeLabel}
        </span>
      </div>
    </div>
  );
}
