import type { YieldComparisonId, YieldCurveSnapshot, YieldMaturity } from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

/** TradingView UK government bond benchmark yields. Current curve only. */
export const UK_TRADINGVIEW_SYMBOLS: Record<YieldMaturity, string> = {
  "1M": "TVC:GB01MY",
  "3M": "TVC:GB03MY",
  "6M": "TVC:GB06MY",
  "1Y": "TVC:GB01Y",
  "2Y": "TVC:GB02Y",
  "5Y": "TVC:GB05Y",
  "10Y": "TVC:GB10Y",
  "30Y": "TVC:GB30Y",
};

export type UkTradingViewHistoryPeriod = "1D" | "1W" | "1M" | "3M" | "1Y";

export type UkTradingViewQuote = Readonly<{
  maturity: YieldMaturity;
  symbol: string;
  yieldPct: number;
  prevClose: number | null;
  /** Prior levels of this same TradingView symbol. Missing periods stay absent. */
  history: Partial<Record<UkTradingViewHistoryPeriod, number>>;
}>;

/** Prior yield implied by TradingView's own percent change on this symbol. */
export function tradingViewPastYield(close: number, perfPercent: number | null | undefined): number | null {
  if (!Number.isFinite(close) || perfPercent == null || !Number.isFinite(perfPercent) || perfPercent <= -100) {
    return null;
  }
  const past = close / (1 + perfPercent / 100);
  if (!Number.isFinite(past) || past <= 0 || past > 25) return null;
  return past;
}

export type UkTradingViewCurrent = Readonly<{
  fetchedAt: string;
  quotes: readonly UkTradingViewQuote[];
}>;

function historyPeriod(comparisonId: YieldComparisonId): UkTradingViewHistoryPeriod {
  if (comparisonId === "Today" || comparisonId === "1D") return "1D";
  return comparisonId;
}

/**
 * Current and comparison yields are both TradingView benchmark levels for the same symbol.
 * A missing TradingView history point stays empty. Bank of England spots are not used here.
 */
export function buildUkTradingViewYieldSnapshot(
  current: UkTradingViewCurrent,
  comparisonId: YieldComparisonId,
  updatedAtIso: string,
): YieldCurveSnapshot | null {
  const byMaturity = new Map(current.quotes.map((q) => [q.maturity, q]));
  if (!byMaturity.size) return null;

  const period = historyPeriod(comparisonId);
  const asOf = current.fetchedAt.slice(0, 10);
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
    countryId: "GB",
    country: "United Kingdom",
    date: asOf,
    comparisonDate: comparisonId === "Today" ? "prior close" : comparisonId,
    source: "TradingView",
    comparisonSource: "TradingView",
    updatedAt: updatedAtIso,
    points,
    unavailableMaturities: unavailableMaturities.length ? unavailableMaturities : undefined,
  };
}
