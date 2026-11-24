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
  return {
    headline: "Forward repricing (1M)",
    eyebrow: opts.commodityName,
    metricLabel: "6M",
    interpretation: "",
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
        "Ranked by absolute 1M % change of the ~6M delivery contract (nearest listed within ±2 months of six calendar months ahead). 6M = delivery horizon; 1M = repricing measurement period.",
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
