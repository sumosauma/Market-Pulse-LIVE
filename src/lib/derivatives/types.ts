export const DERIVATIVES_MARKET_IDS = ["spx", "sx5e", "omxs30"] as const;

export type DerivativesMarketId = (typeof DERIVATIVES_MARKET_IDS)[number];

export type VolMetric = {
  /** RV20 / IV20: annualized percent. VRP: IV20 − RV20 in vol points. */
  value: number | null;
  asOf: string | null;
  sourceLabel: string | null;
  unavailableReason: string | null;
  /**
   * RV20: 1Y percentile of rolling RV20.
   * VRP: 1Y percentile of the official 30-day implied index minus same-date RV20.
   */
  percentile1y?: number | null;
  percentileObservationCount?: number;
};

export type MarketVolRow = {
  id: DerivativesMarketId;
  label: string;
  countryId: string;
  rv20: VolMetric;
  iv20: VolMetric;
  vrp: VolMetric;
};

export type MarketVolatilityPayload = {
  rows: MarketVolRow[];
  fetchedAt: string;
  fromCache: boolean;
};
