import { RV20_WINDOW, TRADING_DAYS_PER_YEAR } from "./markets";
import { calculatePercentile, type PercentileResult } from "./percentile";

export type DailyClose = {
  date: string;
  close: number;
};

export type Rv20Point = {
  date: string;
  rv20: number;
};

export function logReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const next = closes[i]!;
    if (!(prev > 0) || !(next > 0)) continue;
    out.push(Math.log(next / prev));
  }
  return out;
}

/**
 * Simple returns for series that may include zero or negative prices (e.g. power).
 * Uses (P_t − P_{t−1}) / |P_{t−1}| when P_{t−1} ≠ 0. Skips pairs that cannot form a return.
 */
export function simpleAbsReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const next = closes[i]!;
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev === 0) continue;
    out.push((next - prev) / Math.abs(prev));
  }
  return out;
}

export type ComputeRv20Options = {
  /**
   * Reject a 21-session window when any consecutive pair is more than this many
   * calendar days apart (unexplained gap). Weekends/holidays within the limit are OK.
   */
  maxGapDays?: number;
  /**
   * When true, keep non-positive prices and use simple abs-denominator returns for the
   * window if any price is ≤ 0. Log returns are still used when every price is > 0.
   */
  allowNonPositive?: boolean;
};

/** Sample standard deviation (n − 1). */
export function sampleStdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, x) => sum + x, 0) / values.length;
  let ss = 0;
  for (const x of values) {
    const d = x - mean;
    ss += d * d;
  }
  return Math.sqrt(ss / (values.length - 1));
}

export function annualizeDailyVol(dailyStdev: number): number {
  return dailyStdev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

function validDailyCloses(points: readonly DailyClose[], allowNonPositive = false): DailyClose[] {
  return points.filter((p) => Number.isFinite(p.close) && (allowNonPositive || p.close > 0));
}

function calendarDaysBetween(earlier: string, later: string): number | null {
  const a = Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${later.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function windowRespectsGaps(window: readonly DailyClose[], maxGapDays: number): boolean {
  for (let i = 1; i < window.length; i++) {
    const gap = calendarDaysBetween(window[i - 1]!.date, window[i]!.date);
    if (gap == null || gap < 1 || gap > maxGapDays) return false;
  }
  return true;
}

/**
 * 20-session realized vol from a 21-close window (20 returns).
 * Sample stdev; √252 annualization. Result is a percent (e.g. 9.5).
 */
function rv20FromWindow(
  window: readonly DailyClose[],
  options: ComputeRv20Options = {},
): Rv20Point | null {
  if (window.length !== RV20_WINDOW + 1) return null;
  if (options.maxGapDays != null && !windowRespectsGaps(window, options.maxGapDays)) return null;
  const closes = window.map((p) => p.close);
  const allPositive = closes.every((close) => close > 0);
  const returns =
    allPositive
      ? logReturns(closes)
      : options.allowNonPositive
        ? simpleAbsReturns(closes)
        : [];
  if (returns.length !== RV20_WINDOW) return null;
  const sd = sampleStdev(returns);
  if (sd == null || !Number.isFinite(sd)) return null;
  const last = window[window.length - 1]!;
  return { rv20: annualizeDailyVol(sd), date: last.date };
}

/**
 * 20-session realized vol from daily returns.
 * Uses the last 21 valid closes → 20 returns; sample stdev; √252 annualization.
 * Result is a percent (e.g. 9.5).
 */
export function computeRv20(
  points: readonly DailyClose[],
  options: ComputeRv20Options = {},
): { rv20: number; asOf: string } | null {
  const valid = validDailyCloses(points, options.allowNonPositive === true);
  if (valid.length < RV20_WINDOW + 1) return null;
  const computed = rv20FromWindow(valid.slice(-(RV20_WINDOW + 1)), options);
  if (!computed) return null;
  return { rv20: computed.rv20, asOf: computed.date };
}

/**
 * Rolling daily RV20 over valid closes only. No forward-fill or interpolation.
 * Each observation uses the same 21-close / 20-return window as `computeRv20`.
 * The last point is identical to `computeRv20(points)`.
 */
export function rollingRv20Series(
  points: readonly DailyClose[],
  options: ComputeRv20Options = {},
): Rv20Point[] {
  const valid = validDailyCloses(points, options.allowNonPositive === true);
  if (valid.length < RV20_WINDOW + 1) return [];
  const out: Rv20Point[] = [];
  for (let end = RV20_WINDOW; end < valid.length; end++) {
    const computed = rv20FromWindow(valid.slice(end - RV20_WINDOW, end + 1), options);
    if (computed) out.push(computed);
  }
  return out;
}

/** 1Y percentile of the latest RV20 vs the latest 252 rolling observations (includes today). */
export function rv20Percentile1y(series: readonly Rv20Point[]): PercentileResult | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1]!;
  return calculatePercentile(
    series.map((row) => row.rv20),
    latest.rv20,
  );
}

/**
 * 20-session price-change volatility: sample stdev of absolute daily changes ΔP = P_t − P_{t−1}.
 * Not annualized and not a percentage — use for series where %/log returns are inappropriate
 * (e.g. power prices that can be zero or negative). Result is in the same units as the price.
 */
export function computeAbsChangeVol20(
  points: readonly DailyClose[],
  options: Pick<ComputeRv20Options, "maxGapDays"> = {},
): { vol: number; asOf: string } | null {
  const valid = points.filter((p) => Number.isFinite(p.close));
  if (valid.length < RV20_WINDOW + 1) return null;
  const window = valid.slice(-(RV20_WINDOW + 1));
  if (options.maxGapDays != null && !windowRespectsGaps(window, options.maxGapDays)) return null;
  const changes: number[] = [];
  for (let i = 1; i < window.length; i++) {
    changes.push(window[i]!.close - window[i - 1]!.close);
  }
  if (changes.length !== RV20_WINDOW) return null;
  const sd = sampleStdev(changes);
  if (sd == null || !Number.isFinite(sd)) return null;
  return { vol: sd, asOf: window[window.length - 1]!.date };
}

/** Rolling absolute-change vol series (same window rules as `computeAbsChangeVol20`). */
export function rollingAbsChangeVol20Series(
  points: readonly DailyClose[],
  options: Pick<ComputeRv20Options, "maxGapDays"> = {},
): Rv20Point[] {
  const valid = points.filter((p) => Number.isFinite(p.close));
  if (valid.length < RV20_WINDOW + 1) return [];
  const out: Rv20Point[] = [];
  for (let end = RV20_WINDOW; end < valid.length; end++) {
    const window = valid.slice(end - RV20_WINDOW, end + 1);
    if (options.maxGapDays != null && !windowRespectsGaps(window, options.maxGapDays)) continue;
    const changes: number[] = [];
    for (let i = 1; i < window.length; i++) {
      changes.push(window[i]!.close - window[i - 1]!.close);
    }
    if (changes.length !== RV20_WINDOW) continue;
    const sd = sampleStdev(changes);
    if (sd == null || !Number.isFinite(sd)) continue;
    out.push({ date: window[window.length - 1]!.date, rv20: sd });
  }
  return out;
}

export type VrpPoint = {
  date: string;
  vrp: number;
};

/**
 * Official implied-vol index minus same-date RV20.
 * Dates missing either leg are skipped. No forward-fill.
 * Order follows the realized-vol series.
 */
export function vrpHistoryFromImpliedAndRv(
  implied: readonly { date: string; close: number }[],
  rv: readonly Rv20Point[],
): VrpPoint[] {
  const ivByDate = new Map<string, number>();
  for (const row of implied) {
    if (!row.date || !Number.isFinite(row.close) || row.close <= 0) continue;
    ivByDate.set(row.date, row.close);
  }
  const out: VrpPoint[] = [];
  for (const row of rv) {
    const iv = ivByDate.get(row.date);
    if (iv == null || !Number.isFinite(row.rv20)) continue;
    out.push({ date: row.date, vrp: iv - row.rv20 });
  }
  return out;
}

/** 1Y percentile of the latest premium vs the latest 252 premium observations (includes today). */
export function vrpPercentile1y(series: readonly VrpPoint[]): PercentileResult | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1]!;
  return calculatePercentile(
    series.map((row) => row.vrp),
    latest.vrp,
  );
}

export function computeVrp(iv20Pct: number | null, rv20Pct: number | null): number | null {
  if (iv20Pct == null || rv20Pct == null) return null;
  if (!Number.isFinite(iv20Pct) || !Number.isFinite(rv20Pct)) return null;
  return iv20Pct - rv20Pct;
}
