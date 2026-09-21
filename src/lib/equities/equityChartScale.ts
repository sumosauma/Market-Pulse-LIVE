/** Y-axis domain + ticks for equity detail charts. */

export type ChartYScale = Readonly<{
  min: number;
  max: number;
  ticks: readonly number[];
}>;

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const mag = 10 ** exp;
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * mag;
}

export function computeChartYScale(values: readonly number[], tickCount = 5): ChartYScale {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin || Math.max(Math.abs(dataMax) * 0.01, 1);
  const pad = span * 0.1;

  const roughMin = dataMin - pad;
  const roughMax = dataMax + pad;
  const step = niceStep((roughMax - roughMin) / Math.max(2, tickCount - 1));

  const min = Math.floor(roughMin / step) * step;
  const max = Math.ceil(roughMax / step) * step;

  const ticks: number[] = [];
  for (let v = min; v <= max + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }

  return { min, max, ticks };
}

/** Compact axis labels — matches panel price formatting (en-US). */
export function fmtChartAxisPrice(value: number, digits?: number): string {
  if (digits != null && Number.isFinite(digits) && digits >= 0) {
    return value.toFixed(digits);
  }
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return Math.round(value).toLocaleString("en-US");
  }
  if (abs >= 100) {
    return value.toFixed(0);
  }
  if (abs >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

export function mapY(
  value: number,
  scale: ChartYScale,
  plotTop: number,
  plotHeight: number,
): number {
  const span = scale.max - scale.min || 1;
  return plotTop + plotHeight - ((value - scale.min) / span) * plotHeight;
}

export function mapX(index: number, count: number, plotLeft: number, plotWidth: number): number {
  if (count <= 1) return plotLeft + plotWidth / 2;
  return plotLeft + (index / (count - 1)) * plotWidth;
}

/** Evenly spaced point indices for X-axis time labels. */
export function pickChartXTickIndices(count: number, tickCount = 5): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const n = Math.min(tickCount, count);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(Math.round((i / (n - 1)) * (count - 1)));
  }
  return indices;
}

/** 1D intraday: 3 ticks when sparse, up to 5 when enough points. */
export function pickIntradayXTickIndices(count: number): number[] {
  const tickCount = count <= 5 ? Math.min(3, count) : Math.min(5, count);
  return pickChartXTickIndices(count, tickCount);
}

/** Compact date label for chart X-axis (en-US). */
export function fmtChartAxisDate(isoDate: string): string {
  const d = parseChartDate(isoDate);
  if (d == null) return isoDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type ChartAxisLabelMode = "date" | "time" | "datetime";

/** Parse chart date/datetime to Date — supports ISO (YYYY-MM-DD) and US (MM/DD/YYYY). */
export function parseChartDate(iso: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const d = iso.includes("T") ? new Date(iso) : new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(iso)) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = iso.includes("T") ? new Date(iso) : new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse chart date/datetime to epoch ms — null when invalid. */
export function parseChartTimestamp(iso: string): number | null {
  const d = parseChartDate(iso);
  return d == null ? null : d.getTime();
}

/** Infer X-axis label mode from series span. */
export function inferChartAxisLabelMode(dates: readonly string[]): ChartAxisLabelMode {
  const parsed = dates.map(parseChartTimestamp).filter((t): t is number => t !== null);
  if (parsed.length < 2) return "date";

  const hasTime = dates.some((d) => d.includes("T"));
  if (!hasTime) return "date";

  const spanMs = parsed[parsed.length - 1]! - parsed[0]!;
  return spanMs <= 36 * 60 * 60 * 1000 ? "time" : "date";
}

export type ChartTimeTick = Readonly<{
  key: string;
  x: number;
  label: string;
  textAnchor: "start" | "middle" | "end";
}>;

/** Map a series index to X by elapsed time (not array index). */
export function mapXByTime(
  index: number,
  dates: readonly string[],
  plotLeft: number,
  plotWidth: number,
): number {
  const times = dates.map(parseChartTimestamp);
  const t = times[index];
  const valid = times.filter((x): x is number => x !== null);
  if (t == null || valid.length < 2) {
    return mapX(index, dates.length, plotLeft, plotWidth);
  }

  const tMin = Math.min(...valid);
  const tMax = Math.max(...valid);
  const span = tMax - tMin || 1;
  return plotLeft + ((t - tMin) / span) * plotWidth;
}

/**
 * X-axis ticks at true temporal start / midpoint / end.
 * Tick positions are proportional to elapsed time; labels reflect calendar time at each tick.
 */
export function pickChartTimeTicks(
  dates: readonly string[],
  plotLeft: number,
  plotWidth: number,
  tickCount = 3,
): ChartTimeTick[] {
  const times = dates.map(parseChartTimestamp).filter((t): t is number => t !== null);
  if (times.length < 2) return [];

  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = tMax - tMin || 1;
  const mode = inferChartAxisLabelMode(dates);
  const n = Math.min(Math.max(tickCount, 2), 3);

  const ticks: ChartTimeTick[] = [];
  for (let i = 0; i < n; i++) {
    const target = tMin + (i / (n - 1)) * span;
    const x = plotLeft + ((target - tMin) / span) * plotWidth;
    const label = fmtChartAxisLabel(new Date(target).toISOString(), mode);
    if (ticks.length > 0 && ticks[ticks.length - 1]!.label === label) continue;

    ticks.push({
      key: String(i),
      x,
      label,
      textAnchor: i === 0 ? "start" : i === n - 1 ? "end" : "middle",
    });
  }

  return ticks;
}

/** X-axis label — date, time, or both depending on chart range. */
export function fmtChartAxisLabel(iso: string, mode: ChartAxisLabelMode): string {
  const d = parseChartDate(iso);
  if (d == null) return iso;

  if (mode === "time") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (mode === "datetime") {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return fmtChartAxisDate(iso);
}
