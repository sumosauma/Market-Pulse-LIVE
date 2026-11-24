/**
 * Commodity Market Signals engine — fixed category columns (2 observations each).
 * Reuses existing 1D move, 20D RV and FX calculations. Forward repricing is optional.
 */
import {
  rollingAbsChangeVol20Series,
  rollingRv20Series,
  type DailyClose,
} from "@/lib/derivatives/realizedVol";
import { nordicCalendarTargetDate, stockholmDateOffset } from "./nordicSysCalendar";
import {
  CURRENCY_REPRESENTATIVES,
  SIGNAL_CATEGORY_LABELS,
  SIGNAL_THRESHOLDS,
  formatPercentile,
  formatSignedAbs,
  formatSignedPct,
  type CommoditySignal,
  type CurrencyPairId,
  type PriceMoveHorizon,
  type SignalCategory,
  type SignalStatus,
} from "./signals";
import {
  currencyPairDisplay,
  forwardRepricingDisplay,
  highestVolDisplay,
  largestMoveDisplay,
} from "./signals.presentation";

export type SignalCommodityInput = {
  id: string;
  name: string;
  unit: string;
  fxCurrency: "USD" | "EUR" | null;
  rvKind: "ann_pct" | "abs_change";
  stale: boolean;
  bars: DailyClose[];
};

export type FxSeriesInput = {
  usdsek: DailyClose[];
  eursek: DailyClose[];
  available: boolean;
};

/** Same-contract forward observation supplied by the server when history allows. */
export type ForwardRepricingInput = {
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
  /** Never mix CME settlements with Yahoo closes inside one commodity. */
  priceSource: "cme-settlement" | "yahoo-close";
  priceType: string;
};

export type RawSignal = Omit<CommoditySignal, "status">;

export type CategoryEvaluation = {
  lifecycleKey: string;
  asOf: string;
  available: boolean;
  active: boolean;
};

export type EngineResult = {
  candidates: RawSignal[];
  evaluations: CategoryEvaluation[];
  asOf: string | null;
  coverageInsufficient: boolean;
  fxAvailable: boolean;
};

/** PIT percentile: rank `current` vs up to `lookback` prior values only. */
export function pitPercentile(
  priorValues: readonly number[],
  current: number,
  lookback = SIGNAL_THRESHOLDS.moveLookback,
  minObservations = SIGNAL_THRESHOLDS.moveMinObservations,
): { percentile: number; observationCount: number } | null {
  if (!Number.isFinite(current) || priorValues.length < minObservations) return null;
  const window = priorValues.slice(-lookback);
  if (window.length < minObservations) return null;
  let count = 0;
  for (const value of window) {
    if (value <= current) count += 1;
  }
  const percentile = Math.min(100, Math.max(0, (count / window.length) * 100));
  return { percentile, observationCount: window.length };
}

function sessionReturn(
  bars: readonly DailyClose[],
  sessionsBack: number,
): { asOf: string; ret: number; absChange: number } | null {
  if (bars.length < sessionsBack + 1) return null;
  const latest = bars[bars.length - 1]!;
  const prior = bars[bars.length - 1 - sessionsBack]!;
  if (!(latest.close > 0) || !(prior.close > 0)) return null;
  return {
    asOf: latest.date,
    ret: latest.close / prior.close - 1,
    absChange: latest.close - prior.close,
  };
}

function nordicCalendarReturn(
  bars: readonly DailyClose[],
  horizon: PriceMoveHorizon,
): { asOf: string; ret: number; absChange: number } | null {
  if (bars.length < 2) return null;
  const latest = bars[bars.length - 1]!;
  if (!Number.isFinite(latest.close) || !/^\d{4}-\d{2}-\d{2}$/.test(latest.date)) return null;
  const target = nordicCalendarTargetDate(latest.date, horizon);
  const prior = bars.find((row) => row.date === target);
  if (!prior || !Number.isFinite(prior.close)) return null;
  const absChange = latest.close - prior.close;
  const ret =
    prior.close !== 0 && Number.isFinite(prior.close) ? absChange / Math.abs(prior.close) : null;
  if (ret == null || !Number.isFinite(ret)) return null;
  return { asOf: latest.date, ret, absChange };
}

function sessionAbsMoveSeries(bars: readonly DailyClose[], sessionsBack: number): number[] {
  const out: number[] = [];
  for (let i = sessionsBack; i < bars.length; i++) {
    const latest = bars[i]!;
    const prior = bars[i - sessionsBack]!;
    if (!(latest.close > 0) || !(prior.close > 0)) continue;
    out.push(Math.abs(latest.close / prior.close - 1));
  }
  return out;
}

function nordicAbsChangeSeries(bars: readonly DailyClose[], horizon: PriceMoveHorizon): number[] {
  const out: number[] = [];
  const byDate = new Map(bars.map((row) => [row.date, row.close]));
  for (const row of bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.close)) continue;
    const target = nordicCalendarTargetDate(row.date, horizon);
    const prior = byDate.get(target);
    if (prior == null || !Number.isFinite(prior)) continue;
    out.push(Math.abs(row.close - prior));
  }
  return out;
}

function volSeries(commodity: SignalCommodityInput) {
  if (commodity.rvKind === "abs_change") {
    return rollingAbsChangeVol20Series(commodity.bars, { maxGapDays: 4 });
  }
  return rollingRv20Series(commodity.bars, { maxGapDays: 14 });
}

function rvPercentileAt(
  series: readonly { date: string; rv20: number }[],
  index: number,
): { percentile: number; rv: number; date: string; observationCount: number } | null {
  if (index < 0 || index >= series.length) return null;
  const current = series[index]!;
  const priorRv = series.slice(0, index).map((row) => row.rv20);
  const ranked = pitPercentile(
    priorRv,
    current.rv20,
    SIGNAL_THRESHOLDS.volLookback,
    SIGNAL_THRESHOLDS.volMinObservations,
  );
  if (!ranked) return null;
  return {
    percentile: ranked.percentile,
    rv: current.rv20,
    date: current.date,
    observationCount: ranked.observationCount,
  };
}

type MoveCandidate = {
  commodity: SignalCommodityInput;
  move: { asOf: string; ret: number; absChange: number };
  percentile: number;
  priorPercentile: number;
  sampleSize: number;
  isNordic: boolean;
  historyStart: string | null;
  currentAbs: number;
};

function rankLargestPriceMoves(
  commodities: readonly SignalCommodityInput[],
  n = SIGNAL_THRESHOLDS.perCategory,
): MoveCandidate[] {
  const ranked: MoveCandidate[] = [];
  for (const commodity of commodities) {
    if (commodity.stale) continue;
    const isNordic = commodity.rvKind === "abs_change";
    const sessionsBack = SIGNAL_THRESHOLDS.priceMoveHorizons["1D"];
    const hist = isNordic
      ? nordicAbsChangeSeries(commodity.bars, "1D")
      : sessionAbsMoveSeries(commodity.bars, sessionsBack);
    if (hist.length < SIGNAL_THRESHOLDS.moveMinObservations + 1) continue;

    const move = isNordic
      ? nordicCalendarReturn(commodity.bars, "1D")
      : sessionReturn(commodity.bars, sessionsBack);
    if (!move) continue;

    const currentAbs = isNordic ? Math.abs(move.absChange) : Math.abs(move.ret);
    const prior = hist.slice(0, -1);
    const pit = pitPercentile(
      prior,
      currentAbs,
      SIGNAL_THRESHOLDS.moveLookback,
      SIGNAL_THRESHOLDS.moveMinObservations,
    );
    if (!pit) continue;

    // Same ~1W step as vol: 5 sessions non-Nordic; 7 calendar prints for Nordic SYS.
    const weekSteps = isNordic ? SIGNAL_THRESHOLDS.nordicPriceMoveHorizons["1W"] : 5;
    const weekAgoIdx = hist.length - 1 - weekSteps;
    let priorPercentile = pit.percentile;
    if (weekAgoIdx >= SIGNAL_THRESHOLDS.moveMinObservations) {
      const weekAgoAbs = hist[weekAgoIdx]!;
      const weekAgoPit = pitPercentile(
        hist.slice(0, weekAgoIdx),
        weekAgoAbs,
        SIGNAL_THRESHOLDS.moveLookback,
        SIGNAL_THRESHOLDS.moveMinObservations,
      );
      if (weekAgoPit) priorPercentile = weekAgoPit.percentile;
    }

    ranked.push({
      commodity,
      move,
      percentile: pit.percentile,
      priorPercentile,
      sampleSize: pit.observationCount,
      isNordic,
      historyStart: commodity.bars[0]?.date ?? null,
      currentAbs,
    });
  }

  ranked.sort((a, b) => {
    if (b.percentile !== a.percentile) return b.percentile - a.percentile;
    return b.currentAbs - a.currentAbs;
  });
  return ranked.slice(0, n);
}

type VolCandidate = {
  commodity: SignalCommodityInput;
  rv: number;
  percentile: number;
  priorPercentile: number;
  sampleSize: number;
  asOf: string;
  historyStart: string | null;
};

function rankHighestVolatilities(
  commodities: readonly SignalCommodityInput[],
  n = SIGNAL_THRESHOLDS.perCategory,
): VolCandidate[] {
  const ranked: VolCandidate[] = [];
  for (const commodity of commodities) {
    if (commodity.stale) continue;
    const series = volSeries(commodity);
    if (series.length < SIGNAL_THRESHOLDS.volMinObservations + 6) continue;
    const latestIdx = series.length - 1;
    const now = rvPercentileAt(series, latestIdx);
    if (!now) continue;
    const weekAgo = rvPercentileAt(series, latestIdx - 5);
    const priorPercentile = weekAgo?.percentile ?? now.percentile;

    ranked.push({
      commodity,
      rv: now.rv,
      percentile: now.percentile,
      priorPercentile,
      sampleSize: now.observationCount,
      asOf: now.date,
      historyStart: commodity.bars[0]?.date ?? null,
    });
  }

  ranked.sort((a, b) => {
    if (b.percentile !== a.percentile) return b.percentile - a.percentile;
    return b.rv - a.rv;
  });
  return ranked.slice(0, n);
}

function buildCurrencyPairCards(fx: FxSeriesInput): RawSignal[] {
  if (!fx.available) return [];
  const sessionsBack = SIGNAL_THRESHOLDS.fxHorizonSessions;
  const usdMove = sessionReturn(fx.usdsek, sessionsBack);
  const eurMove = sessionReturn(fx.eursek, sessionsBack);
  if (!usdMove || !eurMove) return [];

  const pairs: Array<{
    pair: CurrencyPairId;
    ret: number;
    asOf: string;
    historyStart: string | null;
    sampleSize: number;
  }> = [
    {
      pair: "USD/SEK",
      ret: usdMove.ret,
      asOf: usdMove.asOf,
      historyStart: fx.usdsek[0]?.date ?? null,
      sampleSize: Math.max(0, fx.usdsek.length - sessionsBack),
    },
    {
      pair: "EUR/SEK",
      ret: eurMove.ret,
      asOf: eurMove.asOf,
      historyStart: fx.eursek[0]?.date ?? null,
      sampleSize: Math.max(0, fx.eursek.length - sessionsBack),
    },
  ];

  return pairs.map((row) => {
    const display = currencyPairDisplay({
      pair: row.pair,
      pairRet: row.ret,
      asOf: row.asOf,
      historyStart: row.historyStart,
      sampleSize: row.sampleSize,
    });
    const navId = CURRENCY_REPRESENTATIVES[row.pair][0]?.id ?? "brent";
    const navName = CURRENCY_REPRESENTATIVES[row.pair][0]?.name ?? row.pair;

    return {
      id: `desk:currency-impact:${row.pair}`,
      lifecycleKey: `desk:currency-impact:${row.pair}`,
      commodityId: navId,
      commodityName: navName,
      category: "currency-impact" as const,
      categoryLabel: SIGNAL_CATEGORY_LABELS["currency-impact"],
      asOf: row.asOf,
      observation: display.interpretation,
      primaryReading: formatSignedPct(row.ret),
      primaryValue: row.ret,
      contextReading: "1W",
      exposureNote: display.interpretation,
      unusualness: Math.abs(row.ret) * 100,
      analysisView: "history" as const,
      analysisRange: "1M" as const,
      display,
    };
  });
}

function buildLargestMoveCard(best: MoveCandidate): RawSignal {
  const { commodity, move, percentile, priorPercentile, sampleSize, isNordic, historyStart } = best;
  const isDecline = isNordic ? move.absChange < 0 : move.ret < 0;
  const display = largestMoveDisplay({
    commodityId: commodity.id,
    commodityName: commodity.name,
    unit: commodity.unit,
    isDecline,
    percentile,
    priorPercentile,
    sampleSize,
    asOf: move.asOf,
    historyStart,
    isNordic,
  });
  const reading = isNordic
    ? formatSignedAbs(move.absChange, 2, commodity.unit)
    : formatSignedPct(move.ret);
  const primaryValue = isNordic ? move.absChange : move.ret;

  return {
    id: `${commodity.id}:largest-price-move`,
    lifecycleKey: `${commodity.id}:largest-price-move`,
    commodityId: commodity.id,
    commodityName: commodity.name,
    category: "largest-price-move",
    categoryLabel: SIGNAL_CATEGORY_LABELS["largest-price-move"],
    asOf: move.asOf,
    observation: display.interpretation,
    primaryReading: reading,
    primaryValue,
    contextReading: `1D · ${formatPercentile(percentile)}`,
    exposureNote: null,
    unusualness: percentile,
    analysisView: "history",
    analysisRange: "1D",
    display,
  };
}

function buildHighestVolCard(best: VolCandidate): RawSignal {
  const display = highestVolDisplay({
    commodityId: best.commodity.id,
    commodityName: best.commodity.name,
    unit: best.commodity.unit,
    percentile: best.percentile,
    priorPercentile: best.priorPercentile,
    sampleSize: best.sampleSize,
    asOf: best.asOf,
    historyStart: best.historyStart,
  });
  const reading =
    best.commodity.rvKind === "abs_change"
      ? formatSignedAbs(best.rv, 2, best.commodity.unit)
      : `${best.rv.toFixed(1)}%`;

  return {
    id: `${best.commodity.id}:highest-volatility`,
    lifecycleKey: `${best.commodity.id}:highest-volatility`,
    commodityId: best.commodity.id,
    commodityName: best.commodity.name,
    category: "highest-volatility",
    categoryLabel: SIGNAL_CATEGORY_LABELS["highest-volatility"],
    asOf: best.asOf,
    observation: display.interpretation,
    primaryReading: reading,
    primaryValue: null,
    contextReading: `20D RV · ${formatPercentile(best.percentile)}`,
    exposureNote: null,
    unusualness: best.percentile,
    analysisView: "history",
    analysisRange: "1Y",
    display,
  };
}

function buildForwardRepricingCards(rows: readonly ForwardRepricingInput[]): RawSignal[] {
  const sorted = [...rows].sort(
    (a, b) => Math.abs(b.sixMonthRet) - Math.abs(a.sixMonthRet),
  );
  return sorted.slice(0, SIGNAL_THRESHOLDS.perCategory).map((row) => {
    const display = forwardRepricingDisplay({
      commodityId: row.commodityId,
      commodityName: row.commodityName,
      sixMonthRet: row.sixMonthRet,
      frontMonthRet: row.frontMonthRet,
      sixMonthContractLabel: row.sixMonthContractLabel,
      frontMonthContractLabel: row.frontMonthContractLabel,
      sixMonthSymbol: row.sixMonthSymbol,
      frontMonthSymbol: row.frontMonthSymbol,
      currentSettleDate: row.currentSettleDate,
      priorSettleDate: row.priorSettleDate,
      priceSource: row.priceSource,
      priceType: row.priceType,
      sampleSize: 2,
    });
    return {
      id: `${row.commodityId}:forward-repricing`,
      lifecycleKey: `${row.commodityId}:forward-repricing`,
      commodityId: row.commodityId,
      commodityName: row.commodityName,
      category: "forward-repricing" as const,
      categoryLabel: SIGNAL_CATEGORY_LABELS["forward-repricing"],
      asOf: row.currentSettleDate,
      observation: display.interpretation,
      primaryReading: formatSignedPct(row.sixMonthRet),
      primaryValue: row.sixMonthRet,
      contextReading: `Front-month ${formatSignedPct(row.frontMonthRet)}`,
      exposureNote: null,
      unusualness: Math.abs(row.sixMonthRet) * 100,
      analysisView: "curve" as const,
      analysisRange: "6M" as const,
      display,
    };
  });
}

export function runSignalEngine(
  commodities: readonly SignalCommodityInput[],
  fx: FxSeriesInput,
  forwardRows: readonly ForwardRepricingInput[] = [],
): EngineResult {
  const fresh = commodities.filter((c) => !c.stale && c.bars.length >= 60);
  const coverageInsufficient = fresh.length < 4;
  const evaluations: CategoryEvaluation[] = [];
  const candidates: RawSignal[] = [];

  const moveBest = rankLargestPriceMoves(commodities);
  for (const row of moveBest) {
    const card = buildLargestMoveCard(row);
    candidates.push(card);
    evaluations.push({
      lifecycleKey: card.lifecycleKey,
      asOf: card.asOf,
      available: true,
      active: true,
    });
  }

  const volBest = rankHighestVolatilities(commodities);
  for (const row of volBest) {
    const card = buildHighestVolCard(row);
    candidates.push(card);
    evaluations.push({
      lifecycleKey: card.lifecycleKey,
      asOf: card.asOf,
      available: true,
      active: true,
    });
  }

  const fxCards = buildCurrencyPairCards(fx);
  if (fxCards.length > 0) {
    candidates.push(...fxCards);
    for (const card of fxCards) {
      evaluations.push({
        lifecycleKey: card.lifecycleKey,
        asOf: card.asOf,
        available: true,
        active: true,
      });
    }
  } else if (fx.available) {
    evaluations.push({
      lifecycleKey: "desk:currency-impact",
      asOf:
        commodities[0]?.bars[commodities[0].bars.length - 1]?.date ??
        new Date().toISOString().slice(0, 10),
      available: false,
      active: false,
    });
  }

  if (forwardRows.length >= SIGNAL_THRESHOLDS.futuresRepricingMinCommodities) {
    const forwardCards = buildForwardRepricingCards(forwardRows);
    candidates.push(...forwardCards);
    for (const card of forwardCards) {
      evaluations.push({
        lifecycleKey: card.lifecycleKey,
        asOf: card.asOf,
        available: true,
        active: true,
      });
    }
  }

  const order: SignalCategory[] = [
    "largest-price-move",
    "highest-volatility",
    "currency-impact",
    "forward-repricing",
  ];
  candidates.sort((a, b) => {
    const cat = order.indexOf(a.category) - order.indexOf(b.category);
    if (cat !== 0) return cat;
    return b.unusualness - a.unusualness;
  });

  let asOf: string | null = null;
  for (const signal of candidates) {
    if (!asOf || signal.asOf > asOf) asOf = signal.asOf;
  }
  if (!asOf) {
    for (const c of fresh) {
      const last = c.bars[c.bars.length - 1]?.date;
      if (last && (!asOf || last > asOf)) asOf = last;
    }
  }

  return {
    candidates,
    evaluations,
    asOf,
    coverageInsufficient,
    fxAvailable: fx.available,
  };
}

export type LifecycleEntry = {
  lastEvaluatedAsOf: string;
  lastActiveAsOf: string | null;
  lastInactiveAsOf: string | null;
  lastStatus: SignalStatus;
};

export type LifecycleState = {
  version: number;
  entries: Record<string, LifecycleEntry>;
  savedAt: string;
};

export function applyLifecycle(
  candidates: readonly RawSignal[],
  previous: LifecycleState | null,
): CommoditySignal[] {
  const entries = previous?.entries ?? {};

  return candidates.map((signal) => {
    const prev = entries[signal.lifecycleKey];
    let status: SignalStatus = null;

    if (!prev) {
      status = null;
    } else if (prev.lastEvaluatedAsOf === signal.asOf) {
      status = prev.lastStatus;
    } else if (
      prev.lastInactiveAsOf != null &&
      prev.lastInactiveAsOf > (prev.lastActiveAsOf ?? "") &&
      prev.lastInactiveAsOf < signal.asOf
    ) {
      status = "NEW";
    } else if (prev.lastActiveAsOf != null && prev.lastActiveAsOf < signal.asOf) {
      status = "PERSISTENT";
    } else if (prev.lastActiveAsOf === signal.asOf) {
      status = prev.lastStatus ?? "PERSISTENT";
    } else {
      status = null;
    }

    return { ...signal, status };
  });
}

export function mergeLifecycleState(
  previous: LifecycleState | null,
  evaluations: readonly CategoryEvaluation[],
  statuses: ReadonlyMap<string, SignalStatus>,
): LifecycleState {
  const entries: Record<string, LifecycleEntry> = { ...(previous?.entries ?? {}) };

  for (const ev of evaluations) {
    if (!ev.available) continue;
    const prev = entries[ev.lifecycleKey];
    const status = statuses.get(ev.lifecycleKey) ?? prev?.lastStatus ?? null;

    if (ev.active) {
      entries[ev.lifecycleKey] = {
        lastEvaluatedAsOf: ev.asOf,
        lastActiveAsOf: ev.asOf,
        lastInactiveAsOf: prev?.lastInactiveAsOf ?? null,
        lastStatus: status,
      };
    } else {
      entries[ev.lifecycleKey] = {
        lastEvaluatedAsOf: ev.asOf,
        lastActiveAsOf: prev?.lastActiveAsOf ?? null,
        lastInactiveAsOf: ev.asOf,
        lastStatus: null,
      };
    }
  }

  return {
    version: 2,
    entries,
    savedAt: new Date().toISOString(),
  };
}

/** Cap at maxDisplayed; already category-ordered. */
export function rankAndTrim(signals: readonly CommoditySignal[]): CommoditySignal[] {
  return signals.slice(0, SIGNAL_THRESHOLDS.maxDisplayed);
}

/** Exported for verification scripts. */
export const __test = {
  pitPercentile,
  sessionReturn,
  nordicCalendarReturn,
  sessionAbsMoveSeries,
  rankLargestPriceMoves,
  rankHighestVolatilities,
};
