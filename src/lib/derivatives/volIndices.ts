import type { SpxVixDayMove } from "./vixSpxDayMove";
import type { SkewIndexRow } from "./skewIndex";

export const VOL_INDEX_IDS = ["vix", "vvix", "vstoxx"] as const;

export type VolIndexId = (typeof VOL_INDEX_IDS)[number];

export type VolIndexDef = Readonly<{
  id: VolIndexId;
  label: string;
  countryId: string;
  hint: string;
  /** TradingView tickers to try in order. Futures / certificates are not included. */
  tvTickers: readonly string[];
  missingReason: string;
}>;

export const VOL_INDICES: readonly VolIndexDef[] = [
  {
    id: "vix",
    label: "VIX",
    countryId: "US",
    hint: "CBOE 30D S&P 500 implied vol",
    tvTickers: ["CBOE:VIX"],
    missingReason: "CBOE:VIX unavailable",
  },
  {
    id: "vvix",
    label: "VVIX",
    countryId: "US",
    hint: "CBOE 30D VIX implied vol",
    /** Cash index is loaded from Cboe VVIX daily history, not TradingView. */
    tvTickers: [],
    missingReason: "CBOE VVIX official EOD unavailable",
  },
  {
    id: "vstoxx",
    label: "VSTOXX",
    countryId: "EU",
    hint: "STOXX 30D Euro Stoxx 50 implied vol",
    /** Cash index is loaded via the STOXX EOD + Markets Insider adapter, not TradingView. */
    tvTickers: [],
    missingReason: "VSTOXX (V2TX) official EOD unavailable",
  },
];

export type VolIndexRow = {
  id: VolIndexId;
  label: string;
  countryId: string;
  hint: string;
  ticker: string | null;
  last: number | null;
  changePct: number | null;
  asOf: string | null;
  sourceLabel: string | null;
  unavailableReason: string | null;
  /** Official EOD 1Y percentile; not derived from delayed/intraday Last. */
  percentile1y: number | null;
  percentileAsOf: string | null;
  percentileObservationCount: number;
  /** VVIX/VIX on the same Cboe EOD session. Present on the VVIX row only. */
  vvixVixRatio?: number | null;
  vvixVixRatioAsOf?: string | null;
  vvixVixRatioPercentile1y?: number | null;
  vvixVixRatioObservationCount?: number;
};

export type VolIndicesPayload = {
  rows: VolIndexRow[];
  fetchedAt: string;
  fromCache: boolean;
  spxVixDayMove: SpxVixDayMove | null;
  sx5eVstoxxDayMove: SpxVixDayMove | null;
  skew: SkewIndexRow | null;
};
