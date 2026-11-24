/**
 * Commodity Market Signals — types and formatters.
 * Desk shows fixed category columns (2 observations each); forward repricing is gated.
 */

import { COMMODITY_SESSION_RETURN_STEPS } from "./sessionReturns";

export const SIGNAL_THRESHOLDS = {
  /** Absolute 1D |move| history depth for PIT percentile ranking. */
  moveLookback: 252,
  /** Require ≥252 prior observations; otherwise exclude from ranking. */
  moveMinObservations: 252,
  /** 20D RV history depth for PIT percentile ranking. */
  volLookback: 252,
  volMinObservations: 252,
  fxLookback: 252,
  fxMinObservations: 252,

  /**
   * Non-Nordic abs-move / return lookbacks in session steps.
   * 1M is chart-aligned (21 closes → 20 steps) and shared with Market Overview
   * via `COMMODITY_SESSION_RETURN_STEPS` in sessionReturns.ts.
   */
  priceMoveHorizons: {
    "1D": 1,
    "1W": COMMODITY_SESSION_RETURN_STEPS["1W"],
    "1M": COMMODITY_SESSION_RETURN_STEPS["1M"],
  } as const,
  nordicPriceMoveHorizons: {
    "1D": 1,
    "1W": 7,
    "1M": 30,
  } as const,

  fxHorizonSessions: 5,
  /** Max calendar-day lag when aligning Frankfurter FX to a commodity session. */
  fxMaxAlignLagDays: 3,
  /** Below this |FX move|, currency effect is described as unchanged. */
  fxUnchangedAbs: 0.0005,

  /** Observations shown per active category. */
  perCategory: 2,
  /** Max signals: 4 categories × 2 observations. */
  maxDisplayed: 8,
  staleDays: 5,

  /**
   * Forward repricing (1M): same-contract settlement history for ~6M delivery vs front.
   * Ranked by absolute % change (not percentile) — still needs ≥2 comparable commodities.
   */
  futuresRepricingMinCommodities: 2,
  /** Target delivery horizon in calendar months (nearest listed; not “6th contract”). */
  futuresRepricingTargetMonths: 6,
  /** Max months away from the 6-calendar-month target when picking a listed delivery. */
  futuresRepricingMaxTargetDistanceMonths: 2,
  /** Preferred lag (calendar days) between current and prior same-contract settlements. */
  futuresRepricingLookbackDays: 30,
  /** Accept prior session within this many days of the ideal lookback. */
  futuresRepricingLookbackToleranceDays: 5,
} as const;

export type SignalCategory =
  | "largest-price-move"
  | "highest-volatility"
  | "currency-impact"
  | "forward-repricing";

/** null = first observation with no prior lifecycle evidence. */
export type SignalStatus = "NEW" | "PERSISTENT" | null;

export type PriceMoveHorizon = "1D" | "1W" | "1M";

/** Four-band significance vs own-history percentile (not a risk score). */
export type SignificanceLevel = "Normal" | "Elevated" | "High" | "Extreme";

export type SignificanceScale = {
  /** Null when history is too short for a percentile. */
  level: SignificanceLevel | null;
  /** Display label: level word or "Insufficient history". */
  label: string;
  /** Segments filled 1–4 for a valid level; 0 when insufficient. */
  filledSegments: number;
  /** Percentile used for the scale, when available. */
  percentile: number | null;
  historyStart: string | null;
};

/**
 * Map a PIT percentile to the shared desk significance scale.
 * Bands: &lt;75 Normal · 75–90 Elevated · 90–97.5 High · ≥97.5 Extreme.
 */
export function significanceFromPercentile(
  percentile: number | null | undefined,
  historyStart: string | null = null,
): SignificanceScale {
  if (percentile == null || !Number.isFinite(percentile)) {
    return {
      level: null,
      label: "Insufficient history",
      filledSegments: 0,
      percentile: null,
      historyStart,
    };
  }
  const pct = Math.min(100, Math.max(0, percentile));
  if (pct < 75) {
    return { level: "Normal", label: "Normal", filledSegments: 1, percentile: pct, historyStart };
  }
  if (pct < 90) {
    return {
      level: "Elevated",
      label: "Elevated",
      filledSegments: 2,
      percentile: pct,
      historyStart,
    };
  }
  if (pct < 97.5) {
    return { level: "High", label: "High", filledSegments: 3, percentile: pct, historyStart };
  }
  return { level: "Extreme", label: "Extreme", filledSegments: 4, percentile: pct, historyStart };
}

export const SIGNIFICANCE_BANDS = [
  { level: "Normal" as const, range: "Below 75th percentile" },
  { level: "Elevated" as const, range: "75th–90th percentile" },
  { level: "High" as const, range: "90th–97.5th percentile" },
  { level: "Extreme" as const, range: "97.5th percentile and above" },
];

export type CurrencyPairId = "USD/SEK" | "EUR/SEK";

export type SignalViz =
  | { kind: "none" }
  | {
      kind: "regime-compare";
      priorPercentile: number;
      currentPercentile: number;
    }
  | {
      kind: "currency-pair";
      pair: CurrencyPairId;
      pairRet: number;
      costDirection: "higher" | "lower" | "unchanged";
      representatives: Array<{ id: string; name: string }>;
      denominationIds: string[];
      denominationNames: string[];
    }
  | {
      kind: "forward-repricing";
      sixMonthRet: number;
      frontMonthRet: number;
      sixMonthContractLabel: string;
      frontMonthContractLabel: string;
      sixMonthSymbol: string;
      frontMonthSymbol: string;
      currentSettleDate: string;
      priorSettleDate: string;
      /** Consistent source for both horizons within this commodity. */
      priceSource: "cme-settlement" | "yahoo-close";
      priceType: string;
    };

export type SignalDisplay = {
  /** Category column heading. */
  headline: string;
  /** Compact identity line (commodity / pair). */
  eyebrow: string;
  metricLabel: string;
  /** Kept for tooltips / legacy consumers — not shown in the dense panel. */
  interpretation: string;
  development: string;
  consequence: string;
  exposure: string;
  significance: string;
  /** Shared four-band significance scale under the main value (price/vol). */
  significanceScale: SignificanceScale;
  historyStart: string | null;
  tooltip: {
    asOf: string;
    sampleSize: number;
    threshold: string;
    method: string;
    benchmark: string;
  };
  viz: SignalViz;
};

export type CommoditySignal = {
  id: string;
  lifecycleKey: string;
  commodityId: string;
  commodityName: string;
  category: SignalCategory;
  categoryLabel: string;
  status: SignalStatus;
  asOf: string;
  observation: string;
  primaryReading: string;
  /** Signed fraction for colouring when applicable (null for RV levels). */
  primaryValue: number | null;
  contextReading: string;
  exposureNote: string | null;
  unusualness: number;
  analysisView: "history" | "curve";
  analysisRange: "1D" | "1M" | "3M" | "6M" | "1Y";
  display: SignalDisplay;
};

export type CommoditySignalsPayload = {
  signals: CommoditySignal[];
  qualifyingIds: string[];
  activeCount: number;
  newCount: number;
  asOf: string | null;
  fetchedAt: string;
  fromStaleCache: boolean;
  coverageInsufficient: boolean;
  futuresRepricingActive: boolean;
  futuresRepricingInactiveReason: string | null;
};

export const SIGNAL_CATEGORY_LABELS: Record<SignalCategory, string> = {
  "largest-price-move": "Highest price move percentiles (1D)",
  "highest-volatility": "Highest 20D Realised Vol. percentiles",
  "currency-impact": "Currency impact on SEK (1W)",
  "forward-repricing": "Largest forward repricing (1M)",
};

/** Display order for category columns. */
export const SIGNAL_CATEGORY_ORDER: SignalCategory[] = [
  "largest-price-move",
  "highest-volatility",
  "currency-impact",
  "forward-repricing",
];

/** Fixed FX representatives (denomination examples, not ranked). */
export const CURRENCY_REPRESENTATIVES: Record<
  CurrencyPairId,
  Array<{ id: string; name: string }>
> = {
  "USD/SEK": [
    { id: "brent", name: "Brent" },
    { id: "gold", name: "Gold" },
  ],
  "EUR/SEK": [
    { id: "ttf", name: "TTF" },
    { id: "nordic-power", name: "Nordic Power" },
  ],
};

export const CURRENCY_DENOMINATION_IDS: Record<CurrencyPairId, string[]> = {
  "USD/SEK": [
    "brent",
    "wti",
    "henry-hub",
    "gold",
    "silver",
    "copper",
    "aluminium",
    "nickel",
    "wheat",
    "corn",
  ],
  "EUR/SEK": ["ttf", "nordic-power"],
};

export function emptySignalsPayload(
  opts: Partial<CommoditySignalsPayload> = {},
): CommoditySignalsPayload {
  return {
    signals: [],
    qualifyingIds: [],
    activeCount: 0,
    newCount: 0,
    asOf: null,
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
    coverageInsufficient: false,
    futuresRepricingActive: false,
    futuresRepricingInactiveReason:
      "Forward repricing inactive until ≥2 commodities have consistent same-contract 1M comparisons (CME settlement-to-settlement or Yahoo close-to-close) for both front-month and ~6M delivery.",
    ...opts,
  };
}

export function formatSignedPct(value: number, digits = 2): string {
  const abs = Math.abs(value * 100).toFixed(digits);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function formatSignedAbs(value: number, digits: number, unit: string): string {
  const abs = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${abs} ${unit}`;
}

export function formatPercentile(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const rounded = Math.round(clamped * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label}th percentile`;
}

/** Panel percentile label — numeric + “percentile” (not ordinal suffixes like “82.1th”). */
export function formatPercentileShort(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const rounded = Math.round(clamped * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} percentile`;
}

export function formatPp(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)} pp`;
}

export function formatSignedPp(fraction: number, digits = 2): string {
  const abs = Math.abs(fraction * 100).toFixed(digits);
  if (fraction > 0) return `+${abs} pp`;
  if (fraction < 0) return `−${abs} pp`;
  return `${abs} pp`;
}
