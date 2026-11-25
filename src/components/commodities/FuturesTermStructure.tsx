import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CommodityInfo } from "@/components/commodities/CommodityInfo";
import {
  CHART_TOOLTIP_WRAPPER_STYLE,
  clampChartTooltipAnchor,
} from "@/components/commodities/chartTooltipPosition";
import {
  HISTORY_CURVE_HORIZONS,
  type FuturesCurve,
  type HistoricalCurve,
  type HistoryCurveHorizon,
} from "@/lib/commodities/futuresCurve";
import { interpolateHistoricalPoints } from "@/lib/commodities/futuresCurveInterpolation";

/** High-contrast categorical palette — one clear hue per horizon. */
const HISTORY_COLORS: Record<HistoryCurveHorizon, string> = {
  today: "#1d4ed8", // blue
  "1d": "#059669", // green
  "1w": "#d97706", // orange
  "1m": "#c026d3", // magenta
};

const HISTORY_LABELS: Record<HistoryCurveHorizon, string> = {
  today: "Today",
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
};

/** Historical overlays that can be toggled alongside Today. */
export const OVERLAY_HORIZONS = ["1d", "1w", "1m"] as const;
export type OverlayHorizon = (typeof OVERLAY_HORIZONS)[number];

function isOverlayHorizon(horizon: HistoryCurveHorizon): horizon is OverlayHorizon {
  return horizon !== "today";
}

export function FuturesCurveCompareControls({
  overlays,
  onToggle,
}: {
  overlays: OverlayHorizon[];
  onToggle: (horizon: HistoryCurveHorizon) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Compare
      </span>
      <div
        className="flex h-7 items-center rounded-md border border-border p-0.5"
        role="group"
        aria-label="Historical curve horizons"
      >
        {HISTORY_CURVE_HORIZONS.map((horizon) => {
          const active =
            horizon === "today" ||
            (isOverlayHorizon(horizon) && overlays.includes(horizon));
          return (
            <button
              key={horizon}
              type="button"
              aria-pressed={active}
              title={
                horizon === "today"
                  ? "Show Today only"
                  : active
                    ? `Hide ${HISTORY_LABELS[horizon]} curve`
                    : `Show ${HISTORY_LABELS[horizon]} curve`
              }
              onClick={() => onToggle(horizon)}
              className={[
                "inline-flex h-full items-center rounded-sm px-2.5 text-[11px] font-medium leading-none transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {HISTORY_LABELS[horizon]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Contract strip / order table under the curve — set true to show again. */
const SHOW_FORWARD_CURVE_ORDER_TABLE = false;

/**
 * Product names for the futures strip (paired with `curve.exchange` from the loader).
 * Distinct from overview spot/cash labels.
 */
const FUTURES_CURVE_PRODUCT: Record<string, string> = {
  brent: "Brent",
  wti: "WTI Crude Oil",
  "henry-hub": "Henry Hub Natural Gas",
  ttf: "Dutch TTF Natural Gas",
  gold: "Gold",
  silver: "Silver",
  copper: "Copper",
  aluminium: "Aluminum",
  wheat: "SRW Wheat",
  corn: "Corn",
};

/**
 * Fully spelled-out contract pricing units for futures-curve (i) tooltips.
 * Verified against futuresCurve.server CME/COMEX/CBOT settlement specs
 * (e.g. COMEX HG copper is USD/lb — not LME USD/t).
 */
const FUTURES_CURVE_PRICING_UNITS: Record<string, string> = {
  brent: "USD per barrel",
  wti: "USD per barrel",
  "henry-hub": "USD per million British thermal units",
  ttf: "EUR per megawatt-hour",
  gold: "USD per troy ounce",
  silver: "USD per troy ounce",
  copper: "USD per pound",
  aluminium: "USD per metric tonne",
  wheat: "US cents per bushel",
  corn: "US cents per bushel",
};

const CURVE_ASOF_MONTHS = [
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

function futuresCurveBenchmark(curve: FuturesCurve): string {
  const product = FUTURES_CURVE_PRODUCT[curve.id];
  if (curve.exchange && product) return `${curve.exchange} ${product} Futures`;
  if (curve.exchange) return `${curve.exchange} Futures`;
  return product ? `${product} Futures` : "N/A";
}

function futuresCurvePricingUnit(curve: FuturesCurve): string {
  return FUTURES_CURVE_PRICING_UNITS[curve.id] ?? "N/A";
}

/** Settlement/session date from the displayed strip — never a cache refresh clock. */
function futuresCurveAsOf(curve: FuturesCurve): string {
  const session = curve.sessionDate;
  if (!session || !/^\d{4}-\d{2}-\d{2}$/.test(session)) return "N/A";
  const [y, m, d] = session.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return "N/A";
  return `${d} ${CURVE_ASOF_MONTHS[m - 1]} ${y}`;
}

function FuturesCurveTooltipBody({ curve }: { curve: FuturesCurve }) {
  return (
    <div className="space-y-1">
      <p className="leading-snug">
        <span className="text-muted-foreground">Benchmark:</span>{" "}
        <span className="font-medium text-foreground">{futuresCurveBenchmark(curve)}</span>
      </p>
      <p className="leading-snug">
        <span className="text-muted-foreground">Unit:</span>{" "}
        <span className="font-medium text-foreground">{futuresCurvePricingUnit(curve)}</span>
      </p>
      <p className="leading-snug">
        <span className="text-muted-foreground">Source:</span>{" "}
        <span className="font-medium text-foreground">{curve.sourceLabel ?? "N/A"}</span>
      </p>
      <p className="leading-snug">
        <span className="text-muted-foreground">As of:</span>{" "}
        <span className="font-medium text-foreground">{futuresCurveAsOf(curve)}</span>
      </p>
      {curve.sessionNote ? (
        <p className="leading-snug text-muted-foreground">{curve.sessionNote}</p>
      ) : null}
      <p className="leading-snug text-muted-foreground">
        Missing historical observations may be estimated using the shape of today&apos;s verified
        futures curve, without changing verified historical prices.
      </p>
    </div>
  );
}

function formatAmount(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSigned(value: number, digits: number): string {
  const abs = formatAmount(Math.abs(value), digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function sourceCaption(
  entry: HistoricalCurve | undefined,
  curveSourceLabel?: string | null,
): string {
  if (!entry) return "Unavailable";
  if (entry.unavailableReason && entry.points.every((point) => point.price == null)) {
    return entry.unavailableReason;
  }
  if (!entry.sessionDate || !entry.source) return entry.unavailableReason ?? "Unavailable";
  if (entry.source === "cme") {
    const label =
      curveSourceLabel === "CME Daily Bulletin" ? "CME Daily Bulletin settlement" : "CME settlement";
    return `Source: ${label} ${entry.sessionDate}`;
  }
  if (entry.source === "snapshot") return `Source: Snapshot ${entry.sessionDate}`;
  return `Source: Yahoo close ${entry.sessionDate}`;
}

function axisInterval(pointCount: number, width: number): number {
  if (pointCount <= 1 || width <= 0) return 0;
  const slots = Math.max(1, Math.floor(width / 58));
  return Math.max(0, Math.ceil(pointCount / slots) - 1);
}

function historyByHorizon(curve: FuturesCurve): Map<HistoryCurveHorizon, HistoricalCurve> {
  return new Map((curve.history ?? []).map((entry) => [entry.horizon, entry]));
}

function changeTone(value: number | null): string {
  if (value == null || value === 0) return "text-foreground";
  return value > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
}

type CurveTooltipRow = {
  label?: string;
  key?: string;
  today?: number | null;
  /** Tooltip / hover price (verified or interpolated display). */
  "1d"?: number | null;
  "1w"?: number | null;
  "1m"?: number | null;
  /** Dashed path: interpolated fills + bounding verified anchors only. */
  "1dFill"?: number | null;
  "1wFill"?: number | null;
  "1mFill"?: number | null;
  /** Observed-only solid path (null on interpolated months). */
  "1dObserved"?: number | null;
  "1wObserved"?: number | null;
  "1mObserved"?: number | null;
  "1dInterpolated"?: boolean;
  "1wInterpolated"?: boolean;
  "1mInterpolated"?: boolean;
};

function horizonInterpolated(row: CurveTooltipRow | undefined, horizon: HistoryCurveHorizon): boolean {
  if (!row || horizon === "today") return false;
  if (horizon === "1d") return row["1dInterpolated"] === true;
  if (horizon === "1w") return row["1wInterpolated"] === true;
  return row["1mInterpolated"] === true;
}

function readSeriesPrice(
  payload: Array<{ dataKey?: string | number; value?: number | null; payload?: CurveTooltipRow }> | undefined,
  row: CurveTooltipRow | undefined,
  dataKey: HistoryCurveHorizon,
  todayByKey: Map<string, number>,
  contractKey: string,
): number | null {
  const item = payload?.find((entry) => entry.dataKey === dataKey);
  if (typeof item?.value === "number") return item.value;
  const fromRow = row?.[dataKey];
  if (typeof fromRow === "number") return fromRow;
  if (dataKey === "today") return todayByKey.get(contractKey) ?? null;
  return null;
}

function MultiCurveTooltip({
  active,
  payload,
  unit,
  digits,
  activeHorizons,
  todayByKey,
  coordinate,
  viewBox,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | null; color?: string; name?: string; payload?: CurveTooltipRow }>;
  unit: string;
  digits: number;
  /** Always includes Today; may include one or more historical overlays. */
  activeHorizons: HistoryCurveHorizon[];
  todayByKey: Map<string, number>;
  coordinate?: { x: number; y: number };
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const label = row?.label ?? "";
  const key = row?.key ?? "";
  const overlays = activeHorizons.filter(isOverlayHorizon);
  const comparing = overlays.length > 0;

  const levels = activeHorizons.map((horizon) => ({
    horizon,
    value: readSeriesPrice(payload, row, horizon, todayByKey, key),
    interpolated: horizonInterpolated(row, horizon),
  }));
  const todayPx = levels.find((level) => level.horizon === "today")?.value ?? null;
  const singleOverlay = overlays.length === 1 ? overlays[0]! : null;
  const priorLevel = singleOverlay
    ? levels.find((level) => level.horizon === singleOverlay)
    : null;
  const priorPx = priorLevel?.value ?? null;
  const priorInterpolated = priorLevel?.interpolated === true;
  const priorUnavailable = singleOverlay != null && priorPx == null;
  const anyMissingOverlay = overlays.some(
    (horizon) => levels.find((level) => level.horizon === horizon)?.value == null,
  );

  /** Absolute/fraction only for verified (non-interpolated) overlay prices. */
  const changeAbs =
    singleOverlay != null && todayPx != null && priorPx != null && !priorInterpolated
      ? todayPx - priorPx
      : null;
  const changePct =
    changeAbs != null && priorPx != null && priorPx !== 0 ? (changeAbs / priorPx) * 100 : null;

  const tipSize = {
    width: anyMissingOverlay ? 280 : 248,
    height: 72 + levels.length * 28 + (singleOverlay != null && !priorUnavailable ? 72 : 0),
  };
  const anchor = clampChartTooltipAnchor(coordinate, viewBox, tipSize);

  return (
    <div
      style={
        anchor
          ? { position: "absolute", left: anchor.x, top: anchor.y, pointerEvents: "none" }
          : undefined
      }
    >
      <div
        className={[
          "rounded-lg border border-border bg-card text-foreground shadow-lg",
          anyMissingOverlay ? "min-w-[220px] w-max max-w-[300px]" : "min-w-[220px] max-w-[280px]",
        ].join(" ")}
      >
        <div className="border-b border-border/80 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contract
          </div>
          <div className="mt-0.5 text-[13px] font-semibold tracking-tight text-foreground">{label || "—"}</div>
        </div>

        <div className="space-y-2 px-3 py-2.5">
          {levels.map(({ horizon, value, interpolated }) => {
            const missingPrior = horizon !== "today" && value == null;
            return (
              <div
                key={horizon}
                className={[
                  "flex justify-between gap-4",
                  missingPrior ? "items-start" : "items-center",
                ].join(" ")}
              >
                <div className={["flex min-w-0 items-center gap-2", missingPrior ? "pt-0.5" : ""].join(" ")}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: HISTORY_COLORS[horizon] }}
                    aria-hidden
                  />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {HISTORY_LABELS[horizon]}
                  </span>
                </div>
                {missingPrior ? (
                  <div className="shrink-0 text-right text-[11px] font-semibold leading-[1.35] tracking-tight text-muted-foreground">
                    <div className="whitespace-nowrap">Reliable, freely accessible</div>
                    <div className="whitespace-nowrap">futures data is unavailable</div>
                  </div>
                ) : (
                  <div className="shrink-0 text-right font-mono text-[12px] tabular-nums leading-none text-foreground">
                    {value == null ? "—" : formatAmount(value, digits)}
                    {value != null && unit ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
                    ) : null}
                    {interpolated ? (
                      <div className="mt-0.5 text-[9px] font-sans font-medium tracking-wide text-muted-foreground">
                        Estimated
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {comparing && singleOverlay != null && !priorUnavailable && !priorInterpolated ? (
          <div className="border-t border-border/80 bg-muted/35 px-3 py-2.5">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Absolute
                </div>
                <div
                  className={[
                    "mt-1 font-mono text-[15px] font-semibold tabular-nums leading-none",
                    changeTone(changeAbs),
                  ].join(" ")}
                >
                  {changeAbs == null ? "—" : formatSigned(changeAbs, digits)}
                </div>
                {unit ? (
                  <div className="mt-0.5 text-[9px] text-muted-foreground">{unit}</div>
                ) : null}
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Fraction
                </div>
                <div
                  className={[
                    "mt-1 font-mono text-[15px] font-semibold tabular-nums leading-none",
                    changeTone(changePct),
                  ].join(" ")}
                >
                  {changePct == null ? "—" : `${formatSigned(changePct, 2)}%`}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CurveChart({
  curve,
  overlays,
}: {
  curve: FuturesCurve;
  overlays: OverlayHorizon[];
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const byHorizon = historyByHorizon(curve);
  const activeHorizons: HistoryCurveHorizon[] = ["today", ...overlays];

  const rows = useMemo(() => {
    const monthKeys = curve.points.map((point) => ({
      year: point.year,
      monthIndex: point.monthIndex,
    }));

    const todayReference = monthKeys.map((month) => {
      const hit = byHorizon.get("today")?.points.find(
        (p) => p.year === month.year && p.monthIndex === month.monthIndex,
      );
      const fromHistory = hit?.price;
      if (fromHistory != null && fromHistory > 0) return fromHistory;
      const live = curve.points.find(
        (p) => p.year === month.year && p.monthIndex === month.monthIndex && !p.gap,
      )?.price;
      return live != null && live > 0 ? live : null;
    });

    const filledByHorizon = new Map<
      OverlayHorizon,
      ReturnType<typeof interpolateHistoricalPoints>
    >();
    for (const horizon of OVERLAY_HORIZONS) {
      const entry = byHorizon.get(horizon);
      const raw = monthKeys.map((month) => {
        const hit = entry?.points.find(
          (p) => p.year === month.year && p.monthIndex === month.monthIndex,
        );
        return { year: month.year, monthIndex: month.monthIndex, price: hit?.price ?? null };
      });
      // Skip estimation when the overlay has no verified points at all.
      filledByHorizon.set(horizon, interpolateHistoricalPoints(raw, todayReference));
    }

    return curve.points.map((point, index) => {
      const key = `${point.year}-${point.monthIndex}`;
      const todayHit = byHorizon.get("today")?.points.find(
        (p) => p.year === point.year && p.monthIndex === point.monthIndex,
      );
      const row: CurveTooltipRow & { axisLabel: string } = {
        key,
        label: point.label,
        axisLabel: point.axisLabel,
        today: todayHit?.price ?? point.price,
      };
      for (const horizon of OVERLAY_HORIZONS) {
        const series = filledByHorizon.get(horizon) ?? [];
        const filled = series[index];
        const observed = filled?.price ?? null;
        const display = filled?.displayPrice ?? null;
        const interpolated = filled?.interpolated === true;
        const neighborInterpolated =
          series[index - 1]?.interpolated === true || series[index + 1]?.interpolated === true;
        // Dashed path only across gaps (plus the verified anchors that bound them).
        const dashValue =
          interpolated || (observed != null && neighborInterpolated) ? display : null;
        row[horizon] = display;
        if (horizon === "1d") {
          row["1dFill"] = dashValue;
          row["1dObserved"] = observed;
          row["1dInterpolated"] = interpolated;
        } else if (horizon === "1w") {
          row["1wFill"] = dashValue;
          row["1wObserved"] = observed;
          row["1wInterpolated"] = interpolated;
        } else {
          row["1mFill"] = dashValue;
          row["1mObserved"] = observed;
          row["1mInterpolated"] = interpolated;
        }
      }
      return row;
    });
  }, [curve.points, byHorizon]);

  const todayByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of curve.points) {
      if (point.price != null) map.set(`${point.year}-${point.monthIndex}`, point.price);
    }
    return map;
  }, [curve.points]);

  return (
    <div ref={frame} className="relative min-h-[280px] flex-1">
      <div className="absolute inset-0 px-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.65} vertical={false} />
            <XAxis
              dataKey="axisLabel"
              interval={axisInterval(curve.points.length, width)}
              angle={-40}
              textAnchor="end"
              height={56}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={64}
              tickFormatter={(value) => formatAmount(Number(value), curve.digits)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              label={{
                value: curve.unit ?? "",
                angle: -90,
                position: "insideLeft",
                offset: 12,
                style: { fontSize: 10, fill: "var(--muted-foreground)", textAnchor: "middle" },
              }}
            />
            <Tooltip
              // Keep null historical closes in the active payload so the card still opens on that month.
              filterNull={false}
              shared
              cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              allowEscapeViewBox={{ x: false, y: false }}
              content={(props) => (
                <MultiCurveTooltip
                  active={props.active}
                  payload={
                    props.payload as Array<{
                      dataKey?: string | number;
                      value?: number | null;
                      payload?: CurveTooltipRow;
                    }>
                  }
                  unit={curve.unit ?? ""}
                  digits={curve.digits}
                  activeHorizons={activeHorizons}
                  todayByKey={todayByKey}
                  coordinate={props.coordinate as { x: number; y: number } | undefined}
                  viewBox={props.viewBox as { x?: number; y?: number; width?: number; height?: number } | undefined}
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="today"
              name="today"
              stroke={HISTORY_COLORS.today}
              strokeWidth={2.5}
              connectNulls={false}
              legendType="none"
              dot={{ r: 3.5, fill: HISTORY_COLORS.today, stroke: "var(--card)", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: HISTORY_COLORS.today, stroke: "var(--card)", strokeWidth: 1.5 }}
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-in-out"
            />
            {overlays.flatMap((horizon) => {
              const color = HISTORY_COLORS[horizon];
              const fillKey = `${horizon}Fill` as const;
              const observedKey = `${horizon}Observed` as const;
              return [
                <Line
                  key={`${horizon}-fill`}
                  type="monotone"
                  dataKey={fillKey}
                  name={horizon}
                  stroke={color}
                  strokeWidth={1.75}
                  strokeDasharray="6 5"
                  strokeOpacity={0.95}
                  connectNulls={false}
                  legendType="none"
                  dot={false}
                  activeDot={{ r: 4.5, fill: color, stroke: "var(--card)", strokeWidth: 1.5 }}
                  // Animation rewrites stroke-dasharray to a path-length pattern and
                  // leaves interpolated fills looking solid — keep dash static.
                  isAnimationActive={false}
                />,
                <Line
                  key={`${horizon}-observed`}
                  type="monotone"
                  dataKey={observedKey}
                  name={`${horizon}-observed`}
                  stroke={color}
                  strokeWidth={2}
                  connectNulls={false}
                  legendType="none"
                  dot={{ r: 2.5, fill: color, stroke: "var(--card)", strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: color, stroke: "var(--card)", strokeWidth: 1.5 }}
                  isAnimationActive
                  animationDuration={450}
                  animationEasing="ease-in-out"
                />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DeltaTable({ curve }: { curve: FuturesCurve }) {
  const [open, setOpen] = useState(false);
  const byHorizon = historyByHorizon(curve);
  const today = byHorizon.get("today");
  const months = curve.points.filter((point) => !point.gap);
  const digits = curve.digits;

  function priceAt(horizon: HistoryCurveHorizon, year: number, monthIndex: number): number | null {
    const hit = byHorizon.get(horizon)?.points.find((p) => p.year === year && p.monthIndex === monthIndex);
    return hit?.price ?? null;
  }

  function deltaCell(horizon: HistoryCurveHorizon, year: number, monthIndex: number) {
    const todayPx = priceAt("today", year, monthIndex);
    const histPx = priceAt(horizon, year, monthIndex);
    if (todayPx == null || histPx == null) return "—";
    // Today − prior session (same sign as the chart hover change indicator).
    return formatSigned(todayPx - histPx, digits);
  }

  return (
    <div className="shrink-0 border-t border-border bg-muted/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={[
          "group flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors",
          open ? "bg-muted/50" : "hover:bg-muted/55",
        ].join(" ")}
      >
        <span className="flex justify-center" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-foreground/25 transition-colors group-hover:bg-foreground/40" />
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-[15px] font-semibold tracking-tight text-foreground">
            Contract strip &amp; order table
          </span>
          <span
            className={[
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition-colors",
              open
                ? "border-border bg-card text-foreground"
                : "border-foreground/15 bg-card text-foreground group-hover:border-foreground/30",
            ].join(" ")}
          >
            {open ? "Collapse" : "View table"}
            <ChevronDown
              className={["size-3.5 transition-transform duration-200", open ? "rotate-180" : ""].join(" ")}
              strokeWidth={2.25}
              aria-hidden
            />
          </span>
        </span>
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-[min(40vh,280px)] overflow-auto border-t border-border/60">
            <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-1.5 font-semibold">Contract</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Today</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Δ1D</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Δ1W</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Δ1M</th>
                </tr>
              </thead>
              <tbody>
                {months.map((point) => (
                  <tr key={`${point.year}-${point.monthIndex}`} className="border-b border-border/60">
                    <td className="px-2 py-1 font-medium text-foreground">{point.label}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {point.price == null ? "—" : formatAmount(point.price, digits)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {deltaCell("1d", point.year, point.monthIndex)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {deltaCell("1w", point.year, point.monthIndex)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {deltaCell("1m", point.year, point.monthIndex)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-border/60 bg-muted/20">
                  <td className="px-2 py-1 font-medium">M1−M2</td>
                  {(["today", "1d", "1w", "1m"] as const).map((horizon) => {
                    const entry = byHorizon.get(horizon);
                    return (
                      <td key={horizon} className="px-2 py-1 text-right font-mono tabular-nums">
                        {entry?.spreadM1M2 == null ? "—" : formatSigned(entry.spreadM1M2, digits)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-border/60 bg-muted/20">
                  <td className="px-2 py-1 font-medium">M1−M6</td>
                  {(["today", "1d", "1w", "1m"] as const).map((horizon) => {
                    const entry = byHorizon.get(horizon);
                    return (
                      <td key={horizon} className="px-2 py-1 text-right font-mono tabular-nums">
                        {entry?.spreadM1M6 == null ? "—" : formatSigned(entry.spreadM1M6, digits)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-muted/20">
                  <td className="px-2 py-1 font-medium">Shape</td>
                  {(["today", "1d", "1w", "1m"] as const).map((horizon) => {
                    const entry = byHorizon.get(horizon);
                    const shape = entry?.shape ?? "—";
                    const changed =
                      horizon !== "today" && today?.shape && entry?.shape && entry.shape !== today.shape;
                    return (
                      <td
                        key={horizon}
                        className={[
                          "px-2 py-1 text-right",
                          changed ? "font-semibold text-foreground" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {shape}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 py-1.5 text-[10px] text-muted-foreground">
              {HISTORY_CURVE_HORIZONS.map((horizon) => (
                <span key={horizon}>
                  <span className="font-medium text-foreground/80">{HISTORY_LABELS[horizon]}:</span>{" "}
                  {sourceCaption(byHorizon.get(horizon), curve.sourceLabel)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** True when an enabled overlay actually renders estimated (dashed) segments. */
function enabledOverlaysHaveEstimatedSegments(
  curve: FuturesCurve,
  overlays: ReadonlyArray<OverlayHorizon>,
): boolean {
  if (overlays.length === 0 || !curve.enabled || curve.points.length === 0) return false;

  const byHorizon = historyByHorizon(curve);
  const monthKeys = curve.points.map((point) => ({
    year: point.year,
    monthIndex: point.monthIndex,
  }));
  const todayReference = monthKeys.map((month) => {
    const hit = byHorizon.get("today")?.points.find(
      (p) => p.year === month.year && p.monthIndex === month.monthIndex,
    );
    if (hit?.price != null && hit.price > 0) return hit.price;
    const live = curve.points.find(
      (p) => p.year === month.year && p.monthIndex === month.monthIndex && !p.gap,
    )?.price;
    return live != null && live > 0 ? live : null;
  });

  for (const horizon of overlays) {
    const entry = byHorizon.get(horizon);
    const raw = monthKeys.map((month) => {
      const hit = entry?.points.find(
        (p) => p.year === month.year && p.monthIndex === month.monthIndex,
      );
      return { year: month.year, monthIndex: month.monthIndex, price: hit?.price ?? null };
    });
    const filled = interpolateHistoricalPoints(raw, todayReference);
    if (filled.some((point) => point.interpolated)) return true;
  }
  return false;
}

export function FuturesCurvePanel({
  curve,
  overlays,
}: {
  curve: FuturesCurve;
  overlays: OverlayHorizon[];
}) {
  const orderedOverlays = OVERLAY_HORIZONS.filter((horizon) => overlays.includes(horizon));
  const showEstimatedLegend = useMemo(
    () =>
      enabledOverlaysHaveEstimatedSegments(
        curve,
        OVERLAY_HORIZONS.filter((horizon) => overlays.includes(horizon)),
      ),
    [curve, overlays],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-8 w-full shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-1">
        <p className="flex min-w-0 items-center gap-1.5 justify-self-start text-[13px] font-semibold leading-snug tracking-tight text-foreground">
          <span className="truncate py-0.5">12-Month Futures Curve</span>
          <CommodityInfo label="About this futures curve">
            <FuturesCurveTooltipBody curve={curve} />
          </CommodityInfo>
        </p>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium leading-none">
          <span className="inline-flex items-center gap-1.5" style={{ color: HISTORY_COLORS.today }}>
            <span className="h-0.5 w-3 rounded-full" style={{ background: HISTORY_COLORS.today }} aria-hidden />
            {HISTORY_LABELS.today}
          </span>
          {orderedOverlays.map((horizon) => (
            <span
              key={horizon}
              className="inline-flex items-center gap-1.5"
              style={{ color: HISTORY_COLORS[horizon] }}
            >
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ background: HISTORY_COLORS[horizon] }}
                aria-hidden
              />
              {HISTORY_LABELS[horizon]}
            </span>
          ))}
          {showEstimatedLegend ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-0.5 w-3.5"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, var(--muted-foreground) 0 3px, transparent 3px 5px)",
                }}
                aria-hidden
              />
              Estimated
            </span>
          ) : null}
        </div>

        <div className="justify-self-end" aria-hidden />
      </div>

      <CurveChart curve={curve} overlays={orderedOverlays} />
      {SHOW_FORWARD_CURVE_ORDER_TABLE ? <DeltaTable curve={curve} /> : null}
    </div>
  );
}
