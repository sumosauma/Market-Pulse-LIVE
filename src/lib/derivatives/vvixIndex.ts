import { parseCboeVolHistory } from "./volTermStructure";
import {
  PERCENTILE_LOOKBACK_SESSIONS,
  PERCENTILE_MIN_OBSERVATIONS,
  dedupeDatedCloses,
  percentileFromDatedCloses,
  type DatedClose,
} from "./percentile";
import type { VolIndexDef, VolIndexRow } from "./volIndices";

export const VVIX_CBOE_HISTORY_URL =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv";

export const VVIX_SYMBOL = "VVIX";

export const VVIX_VIX_RATIO_EXPLAINER =
  "VVIX divided by VIX on the same Cboe end-of-day session. The 1Y percentile ranks that ratio among approximately the last 252 common sessions. A higher reading means VIX options are pricing more vol-of-vol relative to VIX itself, not a directional forecast.";

export type VvixResolved = {
  last: number;
  changePct: number | null;
  asOf: string;
  percentile1y: number | null;
  percentileAsOf: string | null;
  percentileObservationCount: number;
};

export type VvixVixRatio = {
  ratio: number;
  asOf: string;
  percentile1y: number | null;
  observationCount: number;
};

export function vvixChangePct(last: number, prevClose: number): number | null {
  if (!Number.isFinite(last) || !Number.isFinite(prevClose) || !(prevClose > 0)) return null;
  const pct = ((last - prevClose) / prevClose) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** One VVIX/VIX observation per common session date. No fill for missing days. */
export function vvixVixRatioSeries(
  vvixHistory: readonly DatedClose[],
  vixHistory: readonly DatedClose[],
): DatedClose[] {
  const vixByDate = new Map(dedupeDatedCloses(vixHistory).map((row) => [row.date, row.close]));
  const out: DatedClose[] = [];
  for (const row of dedupeDatedCloses(vvixHistory)) {
    const vix = vixByDate.get(row.date);
    if (vix == null || !(vix > 0) || !(row.close > 0)) continue;
    const ratio = row.close / vix;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    out.push({ date: row.date, close: ratio });
  }
  return out;
}

export function resolveVvixVixRatio(
  vvixHistory: readonly DatedClose[],
  vixHistory: readonly DatedClose[],
): VvixVixRatio | null {
  const series = vvixVixRatioSeries(vvixHistory, vixHistory);
  if (series.length === 0) return null;
  const latest = series[series.length - 1]!;
  const ranked = percentileFromDatedCloses(
    series,
    PERCENTILE_LOOKBACK_SESSIONS,
    PERCENTILE_MIN_OBSERVATIONS,
  );
  return {
    ratio: latest.close,
    asOf: latest.date,
    percentile1y: ranked?.percentile ?? null,
    observationCount: ranked?.observationCount ?? 0,
  };
}

export function resolveVvixIndex(csvText: string): VvixResolved | null {
  const history = parseCboeVolHistory(csvText);
  if (history.length < 2) return null;
  const latest = history[history.length - 1]!;
  const prior = history[history.length - 2]!;
  const ranked = percentileFromDatedCloses(
    history,
    PERCENTILE_LOOKBACK_SESSIONS,
    PERCENTILE_MIN_OBSERVATIONS,
  );
  return {
    last: latest.close,
    changePct: vvixChangePct(latest.close, prior.close),
    asOf: latest.date,
    percentile1y: ranked?.percentile ?? null,
    percentileAsOf: ranked?.asOf ?? latest.date,
    percentileObservationCount: ranked?.observationCount ?? 0,
  };
}

export function vvixRowFromResolved(
  def: VolIndexDef,
  resolved: VvixResolved,
  ratio: VvixVixRatio | null = null,
): VolIndexRow {
  return {
    id: def.id,
    label: def.label,
    countryId: def.countryId,
    hint: def.hint,
    ticker: VVIX_SYMBOL,
    last: resolved.last,
    changePct: resolved.changePct,
    asOf: resolved.asOf,
    sourceLabel: `CBOE VVIX EOD ${resolved.asOf}`,
    unavailableReason: null,
    percentile1y: resolved.percentile1y,
    percentileAsOf: resolved.percentileAsOf,
    percentileObservationCount: resolved.percentileObservationCount,
    vvixVixRatio: ratio?.ratio ?? null,
    vvixVixRatioAsOf: ratio?.asOf ?? null,
    vvixVixRatioPercentile1y: ratio?.percentile1y ?? null,
    vvixVixRatioObservationCount: ratio?.observationCount ?? 0,
  };
}

export function emptyVvixRow(def: VolIndexDef, reason = def.missingReason): VolIndexRow {
  return {
    id: def.id,
    label: def.label,
    countryId: def.countryId,
    hint: def.hint,
    ticker: null,
    last: null,
    changePct: null,
    asOf: null,
    sourceLabel: null,
    unavailableReason: reason,
    percentile1y: null,
    percentileAsOf: null,
    percentileObservationCount: 0,
    vvixVixRatio: null,
    vvixVixRatioAsOf: null,
    vvixVixRatioPercentile1y: null,
    vvixVixRatioObservationCount: 0,
  };
}
