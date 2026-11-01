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

function validDailyCloses(points: readonly DailyClose[]): DailyClose[] {
  return points.filter((p) => Number.isFinite(p.close) && p.close > 0);
}

/**
 * 20-session realized vol from a 21-close window (20 log returns).
 * Sample stdev; √252 annualization. Result is a percent (e.g. 9.5).
 */
function rv20FromWindow(window: readonly DailyClose[]): Rv20Point | null {
  if (window.length !== RV20_WINDOW + 1) return null;
  const returns = logReturns(window.map((p) => p.close));
  if (returns.length !== RV20_WINDOW) return null;
  const sd = sampleStdev(returns);
  if (sd == null || !Number.isFinite(sd)) return null;
  const last = window[window.length - 1]!;
  return { rv20: annualizeDailyVol(sd), date: last.date };
}

/**
 * 20-session realized vol from daily log returns.
 * Uses the last 21 valid closes → 20 returns; sample stdev; √252 annualization.
 * Result is a percent (e.g. 9.5).
 */
export function computeRv20(points: readonly DailyClose[]): { rv20: number; asOf: string } | null {
  const valid = validDailyCloses(points);
  if (valid.length < RV20_WINDOW + 1) return null;
  const computed = rv20FromWindow(valid.slice(-(RV20_WINDOW + 1)));
  if (!computed) return null;
  return { rv20: computed.rv20, asOf: computed.date };
}

/**
 * Rolling daily RV20 over valid closes only. No forward-fill or interpolation.
 * Each observation uses the same 21-close / 20-return window as `computeRv20`.
 * The last point is identical to `computeRv20(points)`.
 */
export function rollingRv20Series(points: readonly DailyClose[]): Rv20Point[] {
  const valid = validDailyCloses(points);
  if (valid.length < RV20_WINDOW + 1) return [];
  const out: Rv20Point[] = [];
  for (let end = RV20_WINDOW; end < valid.length; end++) {
    const computed = rv20FromWindow(valid.slice(end - RV20_WINDOW, end + 1));
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
