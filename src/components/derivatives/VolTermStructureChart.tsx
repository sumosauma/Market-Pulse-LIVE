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
import { formatVolPct, formatVolPts } from "@/lib/derivatives/format";
import {
  computeVolTermYDomain,
  displayVolTermShape,
  VOL_TERM_EXPLAINER,
  VOL_TERM_HISTORY_IDS,
  VOL_TERM_METHODOLOGY_NOTE,
  type VolTermHistoryId,
  type VolTermHistorySnapshot,
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

type VolTermView = "markets" | "history";
type MarketFocus = "both" | "spx" | "sx5e";

const VIEW_OPTIONS: { id: VolTermView; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "history", label: "Vs prior" },
];

const FOCUS_OPTIONS: { id: MarketFocus; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "spx", label: "S&P 500" },
  { id: "sx5e", label: "EURO STOXX 50" },
];

type TermChartRow = {
  maturity: string;
  spx: number;
  sx5e: number;
  spxPrior?: number;
  sx5ePrior?: number;
};

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
  asOfLabel: string,
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
      <div className="mb-2 text-[10px] text-muted-foreground">{asOfLabel}</div>
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
  hollow = false,
}: {
  cx?: number;
  cy?: number;
  variant: "spx" | "sx5e";
  hollow?: boolean;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  const stroke = variant === "spx" ? SPX_COLOR : SX5E_COLOR;
  const fill = hollow ? "var(--card)" : stroke;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={hollow ? 3 : 3.5}
      fill={fill}
      stroke={stroke}
      strokeWidth={variant === "spx" && !hollow ? 1 : 1.5}
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
  const [view, setView] = useState<VolTermView>("markets");
  const [focus, setFocus] = useState<MarketFocus>("both");
  const [historyId, setHistoryId] = useState<VolTermHistoryId>("Today");
  const today: VolTermHistorySnapshot | null = payload?.historySnapshots?.Today ?? null;
  const selected: VolTermHistorySnapshot | null = payload?.historySnapshots?.[historyId] ?? null;
  const comparing = view === "history";
  const showSpx = !comparing || focus === "both" || focus === "spx";
  const showSx5e = !comparing || focus === "both" || focus === "sx5e";
  const prior = comparing && historyId !== "Today" ? selected : null;
  const snapshot = comparing ? today : selected;
  const rows: TermChartRow[] | null = snapshot
    ? snapshot.chartRows.map((row) => {
        const earlier = prior?.chartRows.find((item) => item.maturity === row.maturity);
        return {
          maturity: row.maturity,
          spx: row.spx,
          sx5e: row.sx5e,
          spxPrior: earlier?.spx,
          sx5ePrior: earlier?.sx5e,
        };
      })
    : null;
  const asOf = snapshot?.asOf ?? null;
  const yDomain = rows
    ? computeVolTermYDomain(
        rows.flatMap((r) => [
          showSpx ? r.spx : null,
          showSx5e ? r.sx5e : null,
          showSpx ? r.spxPrior : null,
          showSx5e ? r.sx5ePrior : null,
        ]),
      )
    : undefined;
  const initialLoad = isLoading && !payload;
  const unavailable = !initialLoad && (!rows || payload?.unavailableReason);
  const periodIds = comparing
    ? VOL_TERM_HISTORY_IDS.filter((id) => id !== "Today")
    : VOL_TERM_HISTORY_IDS;
  const asOfLabel = comparing
    ? prior
      ? `Today ${formatAsOf(asOf)} · ${historyId} ${formatAsOf(prior.asOf)}`
      : `Today ${formatAsOf(asOf)}`
    : `As of ${formatAsOf(asOf)}`;

  return (
    <div className="w-full min-w-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">
            {comparing
              ? focus === "spx"
                ? "S&P 500 vs an earlier date"
                : focus === "sx5e"
                  ? "EURO STOXX 50 vs an earlier date"
                  : "Each curve vs an earlier date"
              : "S&P 500 vs EURO STOXX 50"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Official EOD · {initialLoad ? "…" : comparing ? asOfLabel : `common as-of ${formatAsOf(asOf)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Term structure view">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={option.id === view}
                onClick={() => {
                  setView(option.id);
                  if (option.id === "history" && historyId === "Today") setHistoryId("1D");
                }}
                className={[
                  "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                  option.id === view ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
          {comparing ? (
            <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Markets on the chart">
              {FOCUS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={option.id === focus}
                  onClick={() => setFocus(option.id)}
                  className={[
                    "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                    option.id === focus ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Term structure history">
            {periodIds.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === historyId}
                onClick={() => setHistoryId(id)}
                className={[
                  "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                  id === historyId ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {id}
              </button>
            ))}
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
      </div>

      {initialLoad ? (
        <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
          Loading official EOD term structure…
        </p>
      ) : unavailable ? (
        <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
          {payload?.unavailableReason ??
            (comparing || historyId !== "Today"
              ? "No shared official EOD on or before that date."
              : "Implied volatility term structure unavailable.")}
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
              <Tooltip content={(p) => TermTooltip(p, asOfLabel)} />
              {showSpx ? (
                <Line
                  type="monotone"
                  dataKey="spx"
                  name="S&P 500"
                  stroke={SPX_COLOR}
                  strokeWidth={2}
                  legendType="none"
                  dot={(dotProps) => <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="spx" />}
                  activeDot={{ r: 4, fill: SPX_COLOR, stroke: "var(--card)", strokeWidth: 1.5 }}
                />
              ) : null}
              {showSx5e ? (
                <Line
                  type="monotone"
                  dataKey="sx5e"
                  name="EURO STOXX 50"
                  stroke={SX5E_COLOR}
                  strokeDasharray={comparing ? undefined : "6 4"}
                  strokeWidth={comparing ? 2 : 1.5}
                  legendType="none"
                  dot={(dotProps) => (
                    <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="sx5e" hollow={!comparing} />
                  )}
                  activeDot={{ r: 4, fill: SX5E_COLOR, stroke: "var(--card)", strokeWidth: 1.5 }}
                />
              ) : null}
              {comparing && prior && showSpx ? (
                <Line
                  type="monotone"
                  dataKey="spxPrior"
                  name={`S&P 500 · ${historyId}`}
                  stroke={SPX_COLOR}
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  legendType="none"
                  dot={(dotProps) => <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="spx" hollow />}
                  activeDot={{ r: 4, fill: "var(--card)", stroke: SPX_COLOR, strokeWidth: 1.5 }}
                />
              ) : null}
              {comparing && prior && showSx5e ? (
                <Line
                  type="monotone"
                  dataKey="sx5ePrior"
                  name={`EURO STOXX 50 · ${historyId}`}
                  stroke={SX5E_COLOR}
                  strokeDasharray="2 3"
                  strokeWidth={1.5}
                  legendType="none"
                  dot={(dotProps) => <CurveDot cx={dotProps.cx} cy={dotProps.cy} variant="sx5e" hollow />}
                  activeDot={{ r: 4, fill: "var(--card)", stroke: SX5E_COLOR, strokeWidth: 1.5 }}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-col items-center justify-center gap-8 px-4 pb-5 pt-1 sm:flex-row sm:items-start sm:gap-36">
        {showSpx ? (
          <CurveSummary
            label="S&P 500"
            variant="spx"
            dashed={comparing}
            oneMonth={snapshot?.spx.oneMonth ?? null}
            oneYear={snapshot?.spx.oneYear ?? null}
            shape={snapshot?.spx.shape ?? null}
            priorOneMonth={prior?.spx.oneMonth ?? null}
            priorOneYear={prior?.spx.oneYear ?? null}
            priorLabel={prior ? historyId : null}
            pending={initialLoad}
          />
        ) : null}
        {showSx5e ? (
          <CurveSummary
            label="EURO STOXX 50"
            variant="sx5e"
            dashed={comparing}
            oneMonth={snapshot?.sx5e.oneMonth ?? null}
            oneYear={snapshot?.sx5e.oneYear ?? null}
            shape={snapshot?.sx5e.shape ?? null}
            priorOneMonth={prior?.sx5e.oneMonth ?? null}
            priorOneYear={prior?.sx5e.oneYear ?? null}
            priorLabel={prior ? historyId : null}
            pending={initialLoad}
          />
        ) : null}
      </div>
    </div>
  );
}

function curveShapeTone(label: string): string {
  if (label === "Contango") return "text-emerald-700 dark:text-emerald-400";
  if (label === "Backwardation") return "text-amber-800 dark:text-amber-400";
  return "text-foreground";
}

function CurveLineSwatch({ variant, dashed }: { variant: "spx" | "sx5e"; dashed: boolean }) {
  const stroke = variant === "spx" ? SPX_COLOR : SX5E_COLOR;
  const priorDash = variant === "spx" ? "5 3" : "2 2";
  return (
    <svg width="44" height="12" aria-hidden className="mx-auto mt-1.5 block">
      <line
        x1="0"
        y1={dashed ? 4 : 6}
        x2="44"
        y2={dashed ? 4 : 6}
        stroke={stroke}
        strokeWidth={variant === "spx" || dashed ? 2.5 : 2}
        strokeDasharray={dashed || variant === "spx" ? undefined : "6 3.5"}
      />
      {dashed ? (
        <line x1="0" y1="9" x2="44" y2="9" stroke={stroke} strokeWidth={1.5} strokeDasharray={priorDash} />
      ) : null}
    </svg>
  );
}

function CurveSummary({
  label,
  variant,
  dashed,
  oneMonth,
  oneYear,
  shape,
  priorOneMonth,
  priorOneYear,
  priorLabel,
  pending,
}: {
  label: string;
  variant: "spx" | "sx5e";
  dashed: boolean;
  oneMonth: number | null;
  oneYear: number | null;
  shape: string | null;
  priorOneMonth: number | null;
  priorOneYear: number | null;
  priorLabel: string | null;
  pending: boolean;
}) {
  const shapeLabel = pending ? "…" : displayVolTermShape(shape);
  const oneMonthMove =
    oneMonth != null && priorOneMonth != null ? formatVolPts(oneMonth - priorOneMonth) : null;
  const oneYearMove =
    oneYear != null && priorOneYear != null ? formatVolPts(oneYear - priorOneYear) : null;
  return (
    <div className="min-w-max text-center">
      <div className="text-[15px] font-semibold tracking-tight text-foreground">{label}</div>
      <CurveLineSwatch variant={variant} dashed={dashed} />
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
      {priorLabel && oneMonthMove && oneYearMove ? (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          vs {priorLabel} · 1M {oneMonthMove} · 1Y {oneYearMove}
        </div>
      ) : null}
    </div>
  );
}
