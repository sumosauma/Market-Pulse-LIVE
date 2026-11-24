export type HistoryPoint = {
  date: string;
  close: number;
};

export type IndexPoint = {
  date: string;
  value: number;
};

/** Parallel history for Cross-Market 1W / 1Y scale — never spliced into the live value. */
export type CrossMarketHistory = {
  asOf: string | null;
  latest: number | null;
  weekAgo: number | null;
  weekChange: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  yearSessions: number | null;
  unavailableReason: string | null;
};

export type CrossMarketLevelPoint = {
  date: string;
  value: number;
};

export type BrentWtiSpread = {
  value: number | null;
  unit: "USD/bbl";
  monthLabel: string | null;
  sessionDate: string | null;
  brentPrice: number | null;
  wtiPrice: number | null;
  brentSymbol: string | null;
  wtiSymbol: string | null;
  brentTradeAt: string | null;
  wtiTradeAt: string | null;
  earlierQuote: boolean;
  sourceLabel: string | null;
  unavailableReason: string | null;
  history: CrossMarketHistory;
};

export type MetalRatio = {
  value: number | null;
  goldPrice: number | null;
  silverPrice: number | null;
  goldAt: string | null;
  silverAt: string | null;
  sourceLabel: string | null;
  unavailableReason: string | null;
  history: CrossMarketHistory;
};

export type CopperGoldRatio = {
  index: number | null;
  rawRatio: number | null;
  baseDate: string | null;
  asOf: string | null;
  points: IndexPoint[];
  copperSymbol: string;
  goldSymbol: string;
  unavailableReason: string | null;
};

/** How `rv20` is measured for display. */
export type Rv20Kind =
  /** Annualized % from 20 daily log returns × √252. */
  | "ann_pct"
  /** Sample stdev of 20 absolute daily price changes (same units as the price). Not a %. */
  | "abs_change";

export type HistoryIndicator = {
  id: string;
  name: string;
  ticker: string;
  unit: string;
  contractLabel: string;
  rv20: number | null;
  rvAsOf: string | null;
  rvKind: Rv20Kind;
  /** 1Y rank of the latest 20D realized vol versus its own rolling history. */
  rvPercentile1y: number | null;
  /**
   * Rolling 20D-vol observations used for `rvPercentile1y` when ranked, or the
   * available count when the percentile is null due to insufficient history.
   */
  rvPercentileSessions: number | null;
  percentile: number | null;
  percentileSessions: number | null;
  priceAsOf: string | null;
  stale: boolean;
  unavailableReason: string | null;
  /** Daily bars underlying Price History and realized volatility. */
  bars: HistoryPoint[];
};

export type CommodityIndicators = {
  brentWti: BrentWtiSpread;
  goldSilver: MetalRatio;
  copperGold: CopperGoldRatio;
  history: HistoryIndicator[];
  fetchedAt: string;
  fromStaleCache: boolean;
};

export const COPPER_GOLD_MIN_SESSIONS = 60;
export const SPOT_ALIGN_MS = 30 * 60 * 1000;
export const HISTORY_STALE_DAYS = 5;

export const CROSS_MARKET_WEEK_SESSIONS = 5;
export const CROSS_MARKET_YEAR_SESSIONS = 252;
export const CROSS_MARKET_MIN_SESSIONS = 60;
/** Within this fraction of the 1Y span from an extreme → “near high/low” commentary. */
export const CROSS_MARKET_NEAR_EXTREME = 0.05;

export function emptyCrossMarketHistory(reason: string): CrossMarketHistory {
  return {
    asOf: null,
    latest: null,
    weekAgo: null,
    weekChange: null,
    yearLow: null,
    yearHigh: null,
    yearSessions: null,
    unavailableReason: reason,
  };
}

/** Absolute spread on common dates only — no filled gaps. */
export function joinSpreadSeries(
  left: readonly HistoryPoint[],
  right: readonly HistoryPoint[],
): CrossMarketLevelPoint[] {
  const rightByDate = new Map<string, number>();
  for (const row of right) {
    if (row.date && row.close > 0) rightByDate.set(row.date, row.close);
  }
  const joined: CrossMarketLevelPoint[] = [];
  for (const row of left) {
    const other = rightByDate.get(row.date);
    if (!row.date || !(row.close > 0) || other == null || !(other > 0)) continue;
    joined.push({ date: row.date, value: row.close - other });
  }
  return joined.sort((a, b) => a.date.localeCompare(b.date));
}

/** Ratio on common dates only — no filled gaps. */
export function joinRatioSeries(
  numerator: readonly HistoryPoint[],
  denominator: readonly HistoryPoint[],
): CrossMarketLevelPoint[] {
  const denByDate = new Map<string, number>();
  for (const row of denominator) {
    if (row.date && row.close > 0) denByDate.set(row.date, row.close);
  }
  const joined: CrossMarketLevelPoint[] = [];
  for (const row of numerator) {
    const den = denByDate.get(row.date);
    if (!row.date || !(row.close > 0) || den == null || !(den > 0)) continue;
    joined.push({ date: row.date, value: row.close / den });
  }
  return joined.sort((a, b) => a.date.localeCompare(b.date));
}

export function crossMarketHistoryStats(
  series: readonly CrossMarketLevelPoint[],
  opts: {
    weekSessions?: number;
    yearSessions?: number;
    minSessions?: number;
  } = {},
): CrossMarketHistory {
  const weekSessions = opts.weekSessions ?? CROSS_MARKET_WEEK_SESSIONS;
  const yearSessions = opts.yearSessions ?? CROSS_MARKET_YEAR_SESSIONS;
  const minSessions = opts.minSessions ?? CROSS_MARKET_MIN_SESSIONS;

  if (series.length < minSessions) {
    return emptyCrossMarketHistory(
      `Historical analytics unavailable. Need ≥${minSessions} matched sessions for a one-year range; have ${series.length}.`,
    );
  }
  if (series.length < weekSessions + 1) {
    return emptyCrossMarketHistory(
      `Historical analytics unavailable. Need ≥${weekSessions + 1} matched sessions for a one-week change; have ${series.length}.`,
    );
  }

  const window = series.slice(-yearSessions);
  const latest = window[window.length - 1]!;
  const weekAgo = window[window.length - 1 - weekSessions];
  if (!weekAgo) {
    return emptyCrossMarketHistory(
      `Historical analytics unavailable. Need ≥${weekSessions + 1} matched sessions for a one-week change; have ${window.length}.`,
    );
  }

  let yearLow = latest.value;
  let yearHigh = latest.value;
  for (const point of window) {
    if (point.value < yearLow) yearLow = point.value;
    if (point.value > yearHigh) yearHigh = point.value;
  }

  return {
    asOf: latest.date,
    latest: latest.value,
    weekAgo: weekAgo.value,
    weekChange: latest.value - weekAgo.value,
    yearLow,
    yearHigh,
    yearSessions: window.length,
    unavailableReason: null,
  };
}

export type CrossMarketCommentaryKind = "brent-wti" | "gold-silver";

/** Deterministic one-liner from history stats — no speculative language. */
export function crossMarketCommentary(
  kind: CrossMarketCommentaryKind,
  history: CrossMarketHistory,
): string | null {
  const { latest, weekChange, yearLow, yearHigh } = history;
  if (latest == null || yearLow == null || yearHigh == null) {
    if (weekChange == null) return null;
  }

  if (latest != null && yearLow != null && yearHigh != null) {
    const span = yearHigh - yearLow;
    if (span > 0) {
      if ((yearHigh - latest) / span <= CROSS_MARKET_NEAR_EXTREME) {
        return kind === "brent-wti"
          ? "Spread near its one-year high."
          : "Gold/Silver ratio near its one-year high.";
      }
      if ((latest - yearLow) / span <= CROSS_MARKET_NEAR_EXTREME) {
        return kind === "brent-wti"
          ? "Spread near its one-year low."
          : "Gold/Silver ratio near its one-year low.";
      }
    }
  }

  if (weekChange == null || !Number.isFinite(weekChange)) return null;
  if (weekChange > 0) {
    return kind === "brent-wti"
      ? "Brent premium widened over the past week."
      : "Gold/Silver ratio increased over the past week.";
  }
  if (weekChange < 0) {
    return kind === "brent-wti"
      ? "Brent premium narrowed over the past week."
      : "Gold/Silver ratio declined over the past week.";
  }
  return kind === "brent-wti"
    ? "Spread little changed over the past week."
    : "Gold/Silver ratio little changed over the past week.";
}

/** Index = 100 at the first observation of the joined window. No filled dates. */
export function normalizedRatioIndex(
  copper: readonly HistoryPoint[],
  gold: readonly HistoryPoint[],
  window: number,
): { raw: number; index: number; baseDate: string; asOf: string; points: IndexPoint[] } | null {
  const goldByDate = new Map<string, number>();
  for (const row of gold) {
    if (row.date && row.close > 0) goldByDate.set(row.date, row.close);
  }
  const joined: { date: string; ratio: number }[] = [];
  for (const row of copper) {
    const goldClose = goldByDate.get(row.date);
    if (!row.date || !(row.close > 0) || goldClose == null || !(goldClose > 0)) continue;
    joined.push({ date: row.date, ratio: row.close / goldClose });
  }
  joined.sort((a, b) => a.date.localeCompare(b.date));
  const slice = joined.slice(-window);
  const base = slice[0];
  const last = slice[slice.length - 1];
  if (!base || !last || !(base.ratio > 0) || slice.length < COPPER_GOLD_MIN_SESSIONS) return null;
  return {
    raw: last.ratio,
    index: (last.ratio / base.ratio) * 100,
    baseDate: base.date,
    asOf: last.date,
    points: slice.map((row) => ({ date: row.date, value: (row.ratio / base.ratio) * 100 })),
  };
}
