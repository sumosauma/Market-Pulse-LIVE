/**
 * Presentation helpers for Commodity Market Signals category observations.
 */
import {
  CURRENCY_DENOMINATION_IDS,
  CURRENCY_REPRESENTATIVES,
  formatPercentile,
  formatSignedPct,
  significanceFromPercentile,
  type CurrencyPairId,
  type SignalDisplay,
} from "./signals";

const DENOMINATION_NAMES: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  "henry-hub": "Natural Gas",
  gold: "Gold",
  silver: "Silver",
  copper: "Copper",
  aluminium: "Aluminium",
  nickel: "Nickel",
  wheat: "Wheat",
  corn: "Corn",
  ttf: "TTF Natural Gas",
  "nordic-power": "Nordic Power",
};

export function largestMoveDisplay(opts: {
  commodityId: string;
  commodityName: string;
  unit: string;
  isDecline: boolean;
  percentile: number;
  priorPercentile: number;
  sampleSize: number;
  asOf: string;
  historyStart: string | null;
  isNordic: boolean;
}): SignalDisplay {
  const significanceScale = significanceFromPercentile(opts.percentile, opts.historyStart);
  return {
    headline: "Price moves",
    eyebrow: opts.commodityName,
    metricLabel: "1D",
    interpretation: "",
    development: "",
    consequence: "",
    exposure: "",
    significance: formatPercentile(opts.percentile),
    significanceScale,
    historyStart: opts.historyStart,
    tooltip: {
      asOf: opts.asOf,
      sampleSize: opts.sampleSize,
      threshold:
        "Ranks commodities by the percentile of their absolute 1D price movement relative to their own historical distribution.",
      method: opts.isNordic
        ? "Absolute EUR/MWh change over calendar 1D; point-in-time percentile excludes the current observation."
        : "Session return over 1 session step (chart-aligned 1D); point-in-time percentile excludes the current observation.",
      benchmark: `${opts.commodityName} desk history (${opts.unit})${
        opts.historyStart ? ` from ${opts.historyStart}` : ""
      }`,
    },
    viz: {
      kind: "regime-compare",
      priorPercentile: opts.priorPercentile,
      currentPercentile: opts.percentile,
    },
  };
}

export function highestVolDisplay(opts: {
  commodityId: string;
  commodityName: string;
  unit: string;
  percentile: number;
  priorPercentile: number;
  sampleSize: number;
  asOf: string;
  historyStart: string | null;
}): SignalDisplay {
  const significanceScale = significanceFromPercentile(opts.percentile, opts.historyStart);
  return {
    headline: "20D RV",
    eyebrow: opts.commodityName,
    metricLabel: "20D RV",
    interpretation: "",
    development: "",
    consequence: "",
    exposure: "",
    significance: formatPercentile(opts.percentile),
    significanceScale,
    historyStart: opts.historyStart,
    tooltip: {
      asOf: opts.asOf,
      sampleSize: opts.sampleSize,
      threshold: "Ranked by 20D RV percentile vs own ~1Y history (top 2; no gate).",
      method: "20-session realized volatility; point-in-time percentiles vs prior rolling history.",
      benchmark: `${opts.commodityName} (${opts.unit})${
        opts.historyStart ? ` from ${opts.historyStart}` : ""
      }`,
    },
    viz: {
      kind: "regime-compare",
      priorPercentile: opts.priorPercentile,
      currentPercentile: opts.percentile,
    },
  };
}

export function currencyPairDisplay(opts: {
  pair: CurrencyPairId;
  pairRet: number;
  asOf: string;
  historyStart: string | null;
  sampleSize: number;
}): SignalDisplay {
  const abs = Math.abs(opts.pairRet);
  const costDirection =
    abs < 0.0005 ? "unchanged" : opts.pairRet > 0 ? "higher" : "lower";
  const costLabel =
    costDirection === "unchanged"
      ? "Unchanged SEK costs"
      : costDirection === "higher"
        ? "Higher SEK costs"
        : "Lower SEK costs";

  const denominationIds = CURRENCY_DENOMINATION_IDS[opts.pair];
  const denominationNames = denominationIds.map((id) => DENOMINATION_NAMES[id] ?? id);
  const representatives = CURRENCY_REPRESENTATIVES[opts.pair];

  return {
    headline: "Currency impact",
    eyebrow: opts.pair,
    metricLabel: "1W",
    interpretation: costLabel,
    development: "",
    consequence: costLabel,
    exposure: costLabel,
    significance: formatSignedPct(opts.pairRet),
    significanceScale: significanceFromPercentile(null, opts.historyStart),
    historyStart: opts.historyStart,
    tooltip: {
      asOf: opts.asOf,
      sampleSize: opts.sampleSize,
      threshold:
        "Fixed USD/SEK and EUR/SEK rows. Cost direction isolates the FX effect at unchanged positive commodity prices.",
      method:
        "Frankfurter 1W pair return. Representatives are denomination examples (not ranked). Nordic Power may be zero or negative — shown as EUR denomination only, not as a claim that its SEK price necessarily moves with the pair.",
      benchmark: `${opts.pair} · denominated: ${denominationNames.join(", ")}`,
    },
    viz: {
      kind: "currency-pair",
      pair: opts.pair,
      pairRet: opts.pairRet,
      costDirection,
      representatives,
      denominationIds,
      denominationNames,
    },
  };
}

/**
 * Materiality thresholds for forward-repricing market interpretations.
 * Returns are fractional (0.01 = 1%). Evaluated in this order:
 * 1) both broadly unchanged, 2) opposite material moves, 3) same-direction cases.
 */
export const FORWARD_INTERP_STABLE_ABS = 0.005; // 0.5% — |ret| below this counts as unchanged
export const FORWARD_INTERP_OPPOSITE_ABS = 0.01; // 1.0% — each leg must clear this for divergence
export const FORWARD_INTERP_SIMILAR_ABS = 0.01; // 1.0 pp — max |6M − front| for “similarly”

export const FORWARD_REPRICING_INTERPRETATIONS = {
  bothDecliningSimilarly: "Market pricing in lower future prices",
  bothRisingSimilarly: "Market pricing in higher future prices",
  strongerIncreaseSixMonth: "Rising price pressure on future delivery",
  strongerIncreaseFront: "Rising price pressure on near-term delivery",
  strongerDeclineSixMonth: "Easing price pressure on future delivery",
  strongerDeclineFront: "Easing price pressure on near-term delivery",
  diverging: "Diverging near-term and future delivery prices",
  stable: "Stable pricing across delivery horizons",
} as const;

export type ForwardRepricingInterpretation =
  (typeof FORWARD_REPRICING_INTERPRETATIONS)[keyof typeof FORWARD_REPRICING_INTERPRETATIONS];

/**
 * Deterministic one-line reading from same-contract 1M % changes.
 * Does not claim supply, demand, or risk-premium drivers.
 */
export function forwardRepricingInterpretation(
  sixMonthRet: number,
  frontMonthRet: number,
): ForwardRepricingInterpretation {
  const six = Number.isFinite(sixMonthRet) ? sixMonthRet : 0;
  const front = Number.isFinite(frontMonthRet) ? frontMonthRet : 0;
  const sixAbs = Math.abs(six);
  const frontAbs = Math.abs(front);
  const {
    bothDecliningSimilarly,
    bothRisingSimilarly,
    strongerIncreaseSixMonth,
    strongerIncreaseFront,
    strongerDeclineSixMonth,
    strongerDeclineFront,
    diverging,
    stable,
  } = FORWARD_REPRICING_INTERPRETATIONS;

  if (sixAbs < FORWARD_INTERP_STABLE_ABS && frontAbs < FORWARD_INTERP_STABLE_ABS) {
    return stable;
  }

  if (
    six * front < 0 &&
    sixAbs >= FORWARD_INTERP_OPPOSITE_ABS &&
    frontAbs >= FORWARD_INTERP_OPPOSITE_ABS
  ) {
    return diverging;
  }

  const sixSign = sixAbs < FORWARD_INTERP_STABLE_ABS ? 0 : Math.sign(six);
  const frontSign = frontAbs < FORWARD_INTERP_STABLE_ABS ? 0 : Math.sign(front);
  const diff = Math.abs(six - front);

  // Both rising (or one rising and the other unchanged).
  if (sixSign >= 0 && frontSign >= 0 && (sixSign > 0 || frontSign > 0)) {
    if (sixSign > 0 && frontSign > 0 && diff <= FORWARD_INTERP_SIMILAR_ABS) {
      return bothRisingSimilarly;
    }
    return six >= front ? strongerIncreaseSixMonth : strongerIncreaseFront;
  }

  // Both declining (or one declining and the other unchanged).
  if (sixSign <= 0 && frontSign <= 0 && (sixSign < 0 || frontSign < 0)) {
    if (sixSign < 0 && frontSign < 0 && diff <= FORWARD_INTERP_SIMILAR_ABS) {
      return bothDecliningSimilarly;
    }
    return six <= front ? strongerDeclineSixMonth : strongerDeclineFront;
  }

  // Opposite signs but one leg below materiality — attribute to the larger move.
  if (sixAbs >= frontAbs) {
    return six > 0 ? strongerIncreaseSixMonth : strongerDeclineSixMonth;
  }
  return front > 0 ? strongerIncreaseFront : strongerDeclineFront;
}

export function forwardRepricingDisplay(opts: {
  commodityId: string;
  commodityName: string;
  sixMonthRet: number;
  frontMonthRet: number;
  sixMonthContractLabel: string;
  frontMonthContractLabel: string;
  sixMonthSymbol: string;
  frontMonthSymbol: string;
  currentSettleDate: string;
  priorSettleDate: string;
  priceSource: "cme-settlement" | "yahoo-close";
  priceType: string;
  sampleSize: number;
}): SignalDisplay {
  const sourceLabel =
    opts.priceSource === "cme-settlement"
      ? "CME official settlements (settlement-to-settlement)"
      : "Yahoo listed-futures daily closes (close-to-close)";
  const interpretation = forwardRepricingInterpretation(opts.sixMonthRet, opts.frontMonthRet);
  return {
    headline: "Forward repricing (1M)",
    eyebrow: opts.commodityName,
    metricLabel: "6M",
    interpretation,
    development: "",
    consequence: "",
    exposure: "",
    significance: formatSignedPct(opts.sixMonthRet),
    significanceScale: significanceFromPercentile(null, null),
    historyStart: null,
    tooltip: {
      asOf: opts.currentSettleDate,
      sampleSize: opts.sampleSize,
      threshold:
        "Ranked by absolute 1M % change of the ~6M delivery contract (nearest listed within ±2 months of six calendar months ahead). 6M = delivery horizon; 1M = repricing measurement period. Interpretation uses fixed materiality thresholds (stable 0.5%, opposite 1.0% each leg, similar ≤1.0 pp).",
      method: `Same-contract ${opts.priceType}: front ${opts.frontMonthContractLabel} (${opts.frontMonthSymbol}) and ~6M ${opts.sixMonthContractLabel} (${opts.sixMonthSymbol}). As of ${opts.currentSettleDate} vs prior ${opts.priorSettleDate}. Source: ${sourceLabel}. No CME/Yahoo mix within this commodity; no continuous futures or interpolation.`,
      benchmark: opts.commodityName,
    },
    viz: {
      kind: "forward-repricing",
      sixMonthRet: opts.sixMonthRet,
      frontMonthRet: opts.frontMonthRet,
      sixMonthContractLabel: opts.sixMonthContractLabel,
      frontMonthContractLabel: opts.frontMonthContractLabel,
      sixMonthSymbol: opts.sixMonthSymbol,
      frontMonthSymbol: opts.frontMonthSymbol,
      currentSettleDate: opts.currentSettleDate,
      priorSettleDate: opts.priorSettleDate,
      priceSource: opts.priceSource,
      priceType: opts.priceType,
    },
  };
}
