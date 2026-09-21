/** Rolling-session percentile. No rounding; no forward-fill. */

export const PERCENTILE_LOOKBACK_SESSIONS = 252;
export const PERCENTILE_MIN_OBSERVATIONS = 200;

export type PercentileResult = {
  percentile: number;
  observationCount: number;
};

export function finiteNumbers(values: readonly (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * Percentile of `currentValue` versus the latest `lookback` valid observations in `values`.
 * The lookback window is the tail of `values` after dropping non-finite entries (current
 * observation should already be the last valid point when ranking an EOD close).
 *
 * percentile = 100 * count(window <= currentValue) / N
 */
export function calculatePercentile(
  values: readonly number[],
  currentValue: number,
  lookback = PERCENTILE_LOOKBACK_SESSIONS,
  minObservations = PERCENTILE_MIN_OBSERVATIONS,
): PercentileResult | null {
  if (!Number.isFinite(currentValue) || lookback < 1 || minObservations < 1) return null;
  const valid = finiteNumbers(values);
  const window = valid.slice(-lookback);
  if (window.length < minObservations) return null;
  let count = 0;
  for (const value of window) {
    if (value <= currentValue) count += 1;
  }
  const percentile = (count / window.length) * 100;
  if (!Number.isFinite(percentile)) return null;
  return { percentile, observationCount: window.length };
}

export type DatedClose = {
  date: string;
  close: number;
};

/** Sort by date, keep the last close per date, drop invalid rows. */
export function dedupeDatedCloses(rows: readonly DatedClose[]): DatedClose[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row.date || !Number.isFinite(row.close) || row.close <= 0) continue;
    byDate.set(row.date, row.close);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, close]) => ({ date, close }));
}

export function percentileFromDatedCloses(
  rows: readonly DatedClose[],
  lookback = PERCENTILE_LOOKBACK_SESSIONS,
  minObservations = PERCENTILE_MIN_OBSERVATIONS,
): (PercentileResult & { asOf: string; current: number }) | null {
  const series = dedupeDatedCloses(rows);
  if (series.length === 0) return null;
  const latest = series[series.length - 1]!;
  const ranked = calculatePercentile(
    series.map((row) => row.close),
    latest.close,
    lookback,
    minObservations,
  );
  if (!ranked) return null;
  return { ...ranked, asOf: latest.date, current: latest.close };
}
