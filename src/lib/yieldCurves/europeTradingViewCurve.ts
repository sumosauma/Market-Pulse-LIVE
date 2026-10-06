import { fetchTradingViewSymbolFields } from "../derivatives/tradingviewScanner";
import type { SovereignCountryId, YieldComparisonId, YieldCurveSnapshot, YieldMaturity } from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";
import { tradingViewPastYield, type UkTradingViewHistoryPeriod } from "./ukTradingViewCurve";

const TV_HISTORY_FIELDS = "close,prev_close_price,change,Perf.W,Perf.1M,Perf.3M,Perf.Y";

/** Whole-curve fallback symbols. Not mixed with official Bundesbank or TEC points. */
export const GERMANY_TRADINGVIEW_SYMBOLS: Record<YieldMaturity, string> = {
  "1M": "TVC:DE01MY",
  "3M": "TVC:DE03MY",
  "6M": "TVC:DE06MY",
  "1Y": "TVC:DE01Y",
  "2Y": "TVC:DE02Y",
  "5Y": "TVC:DE05Y",
  "10Y": "TVC:DE10Y",
  "30Y": "TVC:DE30Y",
};

export const FRANCE_TRADINGVIEW_SYMBOLS: Record<YieldMaturity, string> = {
  "1M": "TVC:FR01MY",
  "3M": "TVC:FR03MY",
  "6M": "TVC:FR06MY",
  "1Y": "TVC:FR01Y",
  "2Y": "TVC:FR02Y",
  "5Y": "TVC:FR05Y",
  "10Y": "TVC:FR10Y",
  "30Y": "TVC:FR30Y",
};

export type EuropeTradingViewQuote = Readonly<{
  maturity: YieldMaturity;
  symbol: string;
  yieldPct: number;
  history: Partial<Record<UkTradingViewHistoryPeriod, number>>;
}>;

export type EuropeTradingViewCurrent = Readonly<{
  fetchedAt: string;
  countryId: "DE" | "FR";
  quotes: readonly EuropeTradingViewQuote[];
}>;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function historyPeriod(comparisonId: YieldComparisonId): UkTradingViewHistoryPeriod {
  if (comparisonId === "Today" || comparisonId === "1D") return "1D";
  return comparisonId;
}

export async function fetchEuropeTradingViewCurrent(
  countryId: "DE" | "FR",
): Promise<EuropeTradingViewCurrent | null> {
  const symbols = countryId === "DE" ? GERMANY_TRADINGVIEW_SYMBOLS : FRANCE_TRADINGVIEW_SYMBOLS;
  const settled = await Promise.all(
    YIELD_CURVE_MATURITIES.map(async (maturity) => {
      const symbol = symbols[maturity];
      const row = await fetchTradingViewSymbolFields(symbol, TV_HISTORY_FIELDS);
      const close = finiteNumber(row?.close);
      if (close == null || close <= 0 || close > 25) return null;
      const prevClose = finiteNumber(row?.prev_close_price);
      const oneDay =
        prevClose != null && prevClose > 0 ? prevClose : tradingViewPastYield(close, finiteNumber(row?.change));
      const history: Partial<Record<UkTradingViewHistoryPeriod, number>> = {};
      if (oneDay != null) history["1D"] = oneDay;
      const week = tradingViewPastYield(close, finiteNumber(row?.["Perf.W"]));
      const month = tradingViewPastYield(close, finiteNumber(row?.["Perf.1M"]));
      const threeMonth = tradingViewPastYield(close, finiteNumber(row?.["Perf.3M"]));
      const year = tradingViewPastYield(close, finiteNumber(row?.["Perf.Y"]));
      if (week != null) history["1W"] = week;
      if (month != null) history["1M"] = month;
      if (threeMonth != null) history["3M"] = threeMonth;
      if (year != null) history["1Y"] = year;
      return { maturity, symbol, yieldPct: close, history };
    }),
  );
  const quotes = settled.filter((row): row is EuropeTradingViewQuote => row != null);
  if (quotes.length < 4) return null;
  return { fetchedAt: new Date().toISOString(), countryId, quotes };
}

/** Replaces the whole official curve. Every tenor in the snapshot comes from TradingView. */
export function buildEuropeTradingViewYieldSnapshot(
  current: EuropeTradingViewCurrent,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  if (current.quotes.length < 4) return null;
  const byMaturity = new Map(current.quotes.map((q) => [q.maturity, q]));
  const period = historyPeriod(comparisonId);
  const countryId: SovereignCountryId = current.countryId;
  const unavailableMaturities: YieldMaturity[] = [];
  const points = YIELD_CURVE_MATURITIES.map((maturity) => {
    const quote = byMaturity.get(maturity);
    const currentYield = quote?.yieldPct ?? null;
    if (currentYield == null) unavailableMaturities.push(maturity);
    const comparisonYield = quote?.history[period] ?? null;
    const changeBps =
      currentYield != null && comparisonYield != null ? (currentYield - comparisonYield) * 100 : null;
    return {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield,
      comparisonYield,
      changeBps,
    };
  });

  return {
    countryId,
    country: countryId === "DE" ? "Germany" : "France",
    date: current.fetchedAt.slice(0, 10),
    comparisonDate: comparisonId === "Today" ? "prior close" : comparisonId,
    source: "TradingView",
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}
