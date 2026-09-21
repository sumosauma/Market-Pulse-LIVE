import { parseCboeVolHistory } from "./volTermStructure";
import { fetchOfficialText } from "./officialFetch";
import {
  PERCENTILE_LOOKBACK_SESSIONS,
  PERCENTILE_MIN_OBSERVATIONS,
  percentileFromDatedCloses,
} from "./percentile";

export const VIX_CBOE_HISTORY_URL =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

export type EodPercentile = {
  percentile1y: number | null;
  percentileAsOf: string | null;
  percentileObservationCount: number;
  eodClose: number | null;
};

export const EMPTY_EOD_PERCENTILE: EodPercentile = {
  percentile1y: null,
  percentileAsOf: null,
  percentileObservationCount: 0,
  eodClose: null,
};

export async function loadVixEodPercentile(): Promise<EodPercentile> {
  try {
    const text = await fetchOfficialText(VIX_CBOE_HISTORY_URL, "text/csv,*/*", "https://www.cboe.com/");
    if (!text) return EMPTY_EOD_PERCENTILE;
    const ranked = percentileFromDatedCloses(
      parseCboeVolHistory(text),
      PERCENTILE_LOOKBACK_SESSIONS,
      PERCENTILE_MIN_OBSERVATIONS,
    );
    if (!ranked) return EMPTY_EOD_PERCENTILE;
    return {
      percentile1y: ranked.percentile,
      percentileAsOf: ranked.asOf,
      percentileObservationCount: ranked.observationCount,
      eodClose: ranked.current,
    };
  } catch {
    return EMPTY_EOD_PERCENTILE;
  }
}
