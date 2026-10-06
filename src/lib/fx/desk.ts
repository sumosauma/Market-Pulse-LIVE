import {
  annualizeDailyVol,
  computeRv20,
  logReturns,
  rollingRv20Series,
  rv20Percentile1y,
  sampleStdev,
} from "@/lib/derivatives/realizedVol";
import type { FxPairId } from "./pairs";
import type { FxPoint } from "./types";

/** G10 set. USD is the reference currency and prints a zero return. */
export const G10_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK"] as const;
export type G10Currency = (typeof G10_CURRENCIES)[number];

export const FX_DESK_PERIODS = ["1D", "1W", "1M", "3M"] as const;
export type FxDeskPeriod = (typeof FX_DESK_PERIODS)[number];

export const FX_CHART_WINDOWS = ["1M", "3M", "6M", "1Y"] as const;
export type FxChartWindow = (typeof FX_CHART_WINDOWS)[number];

/** Trading-session lookbacks, matching the equity return convention. */
const PERIOD_SESSIONS: Record<FxDeskPeriod, number> = { "1D": 1, "1W": 5, "1M": 21, "3M": 63 };
const CHART_SESSIONS: Record<FxChartWindow, number> = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 };

const CORR_SESSIONS = 60;
const CORR_MIN = 40;

export type FxDeskMarket = {
  fetchedAt: string;
  asOf: string | null;
  /** Foreign-currency units per 1 USD (ECB reference via Frankfurter). */
  usdQuotes: Record<string, FxPoint[]>;
  factors: Record<string, FxPoint[]>;
};

export type FxYieldHistory = {
  fetchedAt: string;
  us2y: FxPoint[];
  us10y: FxPoint[];
  se2y: FxPoint[];
  se10y: FxPoint[];
  usSource: string;
  seSource: string;
};

export type G10Row = {
  currency: G10Currency;
  returns: Record<FxDeskPeriod, number | null>;
};

export type RateDiff = {
  label2y: string;
  label10y: string;
  diff2yBps: number | null;
  diff10yBps: number | null;
  change1m2yBps: number | null;
  change1m10yBps: number | null;
  /** Base yield minus quote yield, in percent, aligned by date. */
  series2y: FxPoint[];
  note: string | null;
};

export type VolSnapshot = {
  rv20: number | null;
  rv60: number | null;
  percentile1y: number | null;
};

export type DriverRow = {
  id: string;
  label: string;
  correlation: number | null;
};

export type IndexedPoint = {
  date: string;
  fx: number;
  rates: number | null;
};

const YIELD_LEG: Record<string, { key2: keyof Pick<FxYieldHistory, "us2y" | "se2y">; key10: keyof Pick<FxYieldHistory, "us10y" | "se10y">; name: string }> = {
  USD: { key2: "us2y", key10: "us10y", name: "US" },
  SEK: { key2: "se2y", key10: "se10y", name: "Sweden" },
};

const DRIVER_DEFS: Record<string, { label: string; factor?: string; spread?: boolean }> = {
  spread2y: { label: "2Y rate differential", spread: true },
  vix: { label: "VIX", factor: "vix" },
  spx: { label: "S&P 500", factor: "spx" },
  stoxx: { label: "STOXX 50", factor: "stoxx" },
  omx: { label: "OMXS30", factor: "omx" },
  brent: { label: "Brent", factor: "brent" },
  gold: { label: "Gold", factor: "gold" },
  dxy: { label: "DXY", factor: "dxy" },
};

/** Pair-specific relationship set. A missing series stays in the table as unavailable. */
const PAIR_DRIVERS: Record<FxPairId, readonly string[]> = {
  eursek: ["spread2y", "vix", "stoxx", "omx", "brent"],
  usdsek: ["spread2y", "dxy", "vix", "spx", "brent"],
  noksek: ["vix", "brent", "omx", "stoxx"],
  eurnok: ["vix", "brent", "stoxx", "omx"],
  eurusd: ["vix", "dxy", "spx", "stoxx", "gold"],
  gbpusd: ["vix", "dxy", "spx", "gold"],
  audusd: ["vix", "dxy", "spx", "brent", "gold"],
  nzdusd: ["vix", "dxy", "spx", "gold"],
  usdjpy: ["vix", "dxy", "spx", "gold"],
  usdchf: ["vix", "dxy", "spx", "gold"],
  usdcad: ["vix", "dxy", "spx", "brent"],
};

export const CARRY_MONITOR_PAIRS: readonly FxPairId[] = ["eursek", "usdsek", "eurnok", "usdjpy", "eurusd"];
export const VOL_MONITOR_PAIRS: readonly FxPairId[] = ["eurusd", "gbpusd", "usdjpy", "eursek", "usdsek", "eurnok", "noksek"];
export const SEK_PAIRS: readonly FxPairId[] = ["eursek", "usdsek", "noksek"];

function finitePositive(points: readonly FxPoint[]): FxPoint[] {
  return points.filter((p) => Number.isFinite(p.close) && p.close > 0);
}

/** USD-value of a currency: 1 for USD, otherwise the reciprocal of the foreign-per-USD quote. */
export function usdValueSeries(currency: string, usdQuotes: Record<string, FxPoint[]>): FxPoint[] {
  if (currency === "USD") {
    const calendar = finitePositive(usdQuotes.EUR ?? usdQuotes.SEK ?? []);
    return calendar.map((p) => ({ date: p.date, close: 1 }));
  }
  return finitePositive(usdQuotes[currency] ?? []).map((p) => ({ date: p.date, close: 1 / p.close }));
}

/** Quote currency per 1 base currency, built from USD quotes. Reciprocal, not a sign flip. */
export function pairSeries(from: string, to: string, usdQuotes: Record<string, FxPoint[]>): FxPoint[] {
  if (from === to) return usdValueSeries("USD", usdQuotes);
  if (from === "USD") return finitePositive(usdQuotes[to] ?? []);
  if (to === "USD") {
    return finitePositive(usdQuotes[from] ?? []).map((p) => ({ date: p.date, close: 1 / p.close }));
  }
  const base = new Map(finitePositive(usdQuotes[from] ?? []).map((p) => [p.date, p.close]));
  const out: FxPoint[] = [];
  for (const point of finitePositive(usdQuotes[to] ?? [])) {
    const baseClose = base.get(point.date);
    if (baseClose == null || !(baseClose > 0)) continue;
    out.push({ date: point.date, close: point.close / baseClose });
  }
  return out;
}

export function returnOverSessions(series: readonly FxPoint[], sessions: number): number | null {
  if (sessions < 1 || series.length <= sessions) return null;
  const last = series[series.length - 1]!.close;
  const base = series[series.length - 1 - sessions]!.close;
  if (!(base > 0) || !Number.isFinite(last)) return null;
  return ((last - base) / base) * 100;
}

export function latestClose(series: readonly FxPoint[]): number | null {
  const last = series[series.length - 1];
  return last && Number.isFinite(last.close) ? last.close : null;
}

export function g10Rows(market: FxDeskMarket): G10Row[] {
  return G10_CURRENCIES.map((currency) => {
    const series = usdValueSeries(currency, market.usdQuotes);
    const returns = {} as Record<FxDeskPeriod, number | null>;
    for (const period of FX_DESK_PERIODS) {
      returns[period] = returnOverSessions(series, PERIOD_SESSIONS[period]);
    }
    return { currency, returns };
  });
}

export function rankG10(rows: readonly G10Row[], period: FxDeskPeriod): G10Row[] {
  return [...rows].sort((a, b) => {
    const av = a.returns[period];
    const bv = b.returns[period];
    if (av == null && bv == null) return a.currency.localeCompare(b.currency);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}

export type G10CrossRow = {
  currency: G10Currency;
  /** Row currency's return versus each column currency. Diagonal is null. */
  cells: Record<G10Currency, number | null>;
  /** Average versus the other G10 currencies. Null when fewer than half the crosses exist. */
  broad: number | null;
  rank: number | null;
};

const BROAD_MIN_CROSSES = 5;

/** Full G10 cross matrix from the USD quote book. No extra pair fetches. */
export function g10CrossMatrix(market: FxDeskMarket, period: FxDeskPeriod): G10CrossRow[] {
  const sessions = PERIOD_SESSIONS[period];
  const rows: G10CrossRow[] = G10_CURRENCIES.map((row) => {
    const cells = {} as Record<G10Currency, number | null>;
    const crosses: number[] = [];
    for (const column of G10_CURRENCIES) {
      if (row === column) {
        cells[column] = null;
        continue;
      }
      const value = returnOverSessions(pairSeries(row, column, market.usdQuotes), sessions);
      cells[column] = value;
      if (value != null) crosses.push(value);
    }
    const broad = crosses.length >= BROAD_MIN_CROSSES
      ? crosses.reduce((sum, value) => sum + value, 0) / crosses.length
      : null;
    return { currency: row, cells, broad, rank: null };
  });
  const ranked = rows
    .filter((row) => row.broad != null)
    .sort((a, b) => b.broad! - a.broad! || a.currency.localeCompare(b.currency));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

function subtractOnDates(left: readonly FxPoint[], right: readonly FxPoint[]): FxPoint[] {
  const rightByDate = new Map(right.map((p) => [p.date, p.close]));
  const out: FxPoint[] = [];
  for (const point of left) {
    const other = rightByDate.get(point.date);
    if (other == null || !Number.isFinite(point.close) || !Number.isFinite(other)) continue;
    out.push({ date: point.date, close: point.close - other });
  }
  return out;
}

function yieldChangeBps(series: readonly FxPoint[], sessions: number): number | null {
  if (series.length <= sessions) return null;
  const last = series[series.length - 1]!.close;
  const base = series[series.length - 1 - sessions]!.close;
  if (!Number.isFinite(last) || !Number.isFinite(base)) return null;
  return (last - base) * 100;
}

export function rateDifferential(
  from: string,
  to: string,
  yields: FxYieldHistory | null,
): RateDiff {
  const empty: RateDiff = {
    label2y: "2Y differential",
    label10y: "10Y differential",
    diff2yBps: null,
    diff10yBps: null,
    change1m2yBps: null,
    change1m10yBps: null,
    series2y: [],
    note: null,
  };
  const base = YIELD_LEG[from];
  const quote = YIELD_LEG[to];
  if (!yields || !base || !quote) {
    return {
      ...empty,
      note: "No daily government yield history is available for both currencies on a comparable basis.",
    };
  }
  const series2y = subtractOnDates(yields[base.key2], yields[quote.key2]);
  const series10y = subtractOnDates(yields[base.key10], yields[quote.key10]);
  const last2 = series2y[series2y.length - 1];
  const last10 = series10y[series10y.length - 1];
  return {
    label2y: `${base.name} 2Y − ${quote.name} 2Y`,
    label10y: `${base.name} 10Y − ${quote.name} 10Y`,
    diff2yBps: last2 ? last2.close * 100 : null,
    diff10yBps: last10 ? last10.close * 100 : null,
    change1m2yBps: yieldChangeBps(series2y, PERIOD_SESSIONS["1M"]),
    change1m10yBps: yieldChangeBps(series10y, PERIOD_SESSIONS["1M"]),
    series2y,
    note: `${yields.usSource} minus ${yields.seSource}. Methodologies differ; the spread is a rates relationship, not a traded forward.`,
  };
}

/** Sweden yield minus the other currency's yield, where both daily series exist. */
export function swedenSpread(
  other: "USD",
  tenor: "2Y" | "10Y",
  yields: FxYieldHistory | null,
): { currentBps: number | null; change1mBps: number | null } {
  if (!yields) return { currentBps: null, change1mBps: null };
  const se = tenor === "2Y" ? yields.se2y : yields.se10y;
  const otherSeries = tenor === "2Y" ? yields.us2y : yields.us10y;
  if (other !== "USD") return { currentBps: null, change1mBps: null };
  const series = subtractOnDates(se, otherSeries);
  const last = series[series.length - 1];
  return {
    currentBps: last ? last.close * 100 : null,
    change1mBps: yieldChangeBps(series, PERIOD_SESSIONS["1M"]),
  };
}

function realizedOver(points: readonly FxPoint[], sessions: number): number | null {
  const valid = finitePositive(points);
  if (valid.length < sessions + 1) return null;
  const returns = logReturns(valid.slice(-(sessions + 1)).map((p) => p.close));
  if (returns.length !== sessions) return null;
  const sd = sampleStdev(returns);
  if (sd == null || !Number.isFinite(sd)) return null;
  return annualizeDailyVol(sd);
}

export function volatilitySnapshot(points: readonly FxPoint[]): VolSnapshot {
  const rv20 = computeRv20(points)?.rv20 ?? null;
  const percentile = rv20Percentile1y(rollingRv20Series(points));
  return {
    rv20,
    rv60: realizedOver(points, 60),
    percentile1y: percentile ? percentile.percentile : null,
  };
}

export function indexedRelationship(
  fx: readonly FxPoint[],
  spread: readonly FxPoint[],
  window: FxChartWindow,
): { points: IndexedPoint[]; ratesAvailable: boolean } {
  const sessions = CHART_SESSIONS[window];
  const fxWindow = finitePositive(fx).slice(-(sessions + 1));
  if (fxWindow.length < 2) return { points: [], ratesAvailable: false };
  const spreadByDate = new Map(spread.map((p) => [p.date, p.close]));
  const overlap = fxWindow.filter((p) => {
    const value = spreadByDate.get(p.date);
    return value != null && Number.isFinite(value);
  });
  if (overlap.length >= 2) {
    const fx0 = overlap[0]!.close;
    const rate0 = spreadByDate.get(overlap[0]!.date)!;
    if (fx0 > 0 && Math.abs(rate0) > 0.0001) {
      return {
        ratesAvailable: true,
        points: overlap.map((p) => ({
          date: p.date,
          fx: (p.close / fx0) * 100,
          rates: (spreadByDate.get(p.date)! / rate0) * 100,
        })),
      };
    }
  }
  const fx0 = fxWindow[0]!.close;
  if (!(fx0 > 0)) return { points: [], ratesAvailable: false };
  return {
    ratesAvailable: false,
    points: fxWindow.map((p) => ({ date: p.date, fx: (p.close / fx0) * 100, rates: null })),
  };
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < CORR_MIN || ys.length !== n) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - meanX;
    const b = ys[i]! - meanY;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx <= 0 || dy <= 0) return null;
  const value = num / Math.sqrt(dx * dy);
  return Number.isFinite(value) ? value : null;
}

function alignedChanges(
  fx: readonly FxPoint[],
  other: readonly FxPoint[],
  mode: "log" | "diff",
): { fx: number[]; other: number[] } | null {
  const otherByDate = new Map(other.map((p) => [p.date, p.close]));
  const shared = finitePositive(fx).filter((p) => {
    const value = otherByDate.get(p.date);
    return value != null && Number.isFinite(value);
  });
  if (shared.length < CORR_SESSIONS + 1) return null;
  const window = shared.slice(-(CORR_SESSIONS + 1));
  const fxChanges: number[] = [];
  const otherChanges: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!;
    const next = window[i]!;
    const prevOther = otherByDate.get(prev.date)!;
    const nextOther = otherByDate.get(next.date)!;
    if (!(prev.close > 0) || !(next.close > 0)) continue;
    if (mode === "log" && (!(prevOther > 0) || !(nextOther > 0))) continue;
    fxChanges.push(Math.log(next.close / prev.close));
    otherChanges.push(mode === "log" ? Math.log(nextOther / prevOther) : nextOther - prevOther);
  }
  if (fxChanges.length < CORR_MIN) return null;
  return { fx: fxChanges, other: otherChanges };
}

export function driverRows(
  pairId: FxPairId,
  fx: readonly FxPoint[],
  market: FxDeskMarket,
  spread2y: readonly FxPoint[],
): DriverRow[] {
  const rows = (PAIR_DRIVERS[pairId] ?? []).map((id) => {
    const def = DRIVER_DEFS[id];
    if (!def) return { id, label: id, correlation: null };
    const series = def.spread ? spread2y : market.factors[def.factor ?? ""] ?? [];
    const aligned = series.length ? alignedChanges(fx, series, def.spread ? "diff" : "log") : null;
    return {
      id,
      label: def.label,
      correlation: aligned ? pearson(aligned.fx, aligned.other) : null,
    };
  });
  return rows.sort((a, b) => {
    if (a.correlation == null && b.correlation == null) return 0;
    if (a.correlation == null) return 1;
    if (b.correlation == null) return -1;
    return Math.abs(b.correlation) - Math.abs(a.correlation);
  });
}

export function strongestRelationship(pairLabel: string, rows: readonly DriverRow[]): string | null {
  const top = rows.find((row) => row.correlation != null);
  if (!top || top.correlation == null || Math.abs(top.correlation) < 0.2) return null;
  return `Recent ${pairLabel} moves have shown the strongest 60D relationship with ${top.label}.`;
}

export type SekRegime = "Rate-supported SEK" | "Rate-headwind SEK" | "Risk-on support" | "Risk-off pressure" | "Mixed";

/**
 * Transparent 1M rules, evaluated in order. A rule is skipped when an input is missing.
 * 1. SE−US 2Y wider by at least 5 bps and SEK stronger vs USD → Rate-supported SEK.
 * 2. SE−US 2Y tighter by at least 5 bps and SEK weaker vs USD → Rate-headwind SEK.
 * 3. VIX down at least 5% and SEK rank 1–4 → Risk-on support.
 * 4. VIX up at least 5% and SEK rank 7–10 → Risk-off pressure.
 * 5. Otherwise Mixed, once at least one input exists.
 */
export function sekRegime(input: {
  spreadChange1mBps: number | null;
  sekReturn1m: number | null;
  vixChange1m: number | null;
  sekRank: number | null;
}): SekRegime | null {
  const { spreadChange1mBps, sekReturn1m, vixChange1m, sekRank } = input;
  if (spreadChange1mBps != null && sekReturn1m != null) {
    if (spreadChange1mBps >= 5 && sekReturn1m > 0) return "Rate-supported SEK";
    if (spreadChange1mBps <= -5 && sekReturn1m < 0) return "Rate-headwind SEK";
  }
  if (vixChange1m != null && sekRank != null) {
    if (vixChange1m <= -5 && sekRank <= 4) return "Risk-on support";
    if (vixChange1m >= 5 && sekRank >= 7) return "Risk-off pressure";
  }
  if (spreadChange1mBps == null && sekReturn1m == null && vixChange1m == null && sekRank == null) return null;
  return "Mixed";
}
