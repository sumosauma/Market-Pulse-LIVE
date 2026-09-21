import type { FxPairId } from "./pairs";

export type FxTimeframe = "1D" | "1W" | "1M" | "1Y" | "5Y";

export const FX_TIMEFRAMES: readonly FxTimeframe[] = ["1D", "1W", "1M", "1Y", "5Y"];

export const DEFAULT_FX_TIMEFRAME: FxTimeframe = "1M";

export type FxPoint = {
  date: string;
  close: number;
};

export type FxLiveRow = {
  pairId: FxPairId;
  label: string;
  rate: number | null;
  change1d: number | null;
  change1dPct: number | null;
  spotAsOf: string | null;
  dailyAsOf: string | null;
  fromCache: boolean;
  error: string | null;
};

export type FxLivePayload = {
  rows: FxLiveRow[];
  fetchedAt: string;
  asOf: string | null;
  fromCache: boolean;
  error: string | null;
};

export type FxHistoryPayload = {
  pairId: FxPairId;
  label: string;
  timeframe: FxTimeframe;
  points: FxPoint[];
  fromCache: boolean;
  fetchedAt: string;
  error: string | null;
};
