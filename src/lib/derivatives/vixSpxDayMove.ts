import { TRADING_DAYS_PER_YEAR } from "./markets";
import type { TvSymbolQuote } from "./tradingviewQuote";

export type SpxVixDayMove = {
  spxLast: number;
  spxPrevClose: number;
  spxChangePct: number;
  vixLast: number;
  vixPrevClose: number;
  dailyImpliedSigmaPct: number;
  spxSourceLabel: string;
  vixSourceLabel: string;
};

/** Daily 1σ in percent: prior-session VIX close / √252. */
export function vixImpliedDailyOneSigmaPct(priorVixClose: number): number | null {
  if (!Number.isFinite(priorVixClose) || priorVixClose <= 0) return null;
  const pct = priorVixClose / Math.sqrt(TRADING_DAYS_PER_YEAR);
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

export function changePctFromPrevClose(last: number, prevClose: number): number | null {
  if (!Number.isFinite(last) || !Number.isFinite(prevClose) || prevClose <= 0) return null;
  const pct = ((last - prevClose) / prevClose) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function buildEquityVolDayMove(input: {
  volLast: number;
  volPrevClose: number;
  equityLast: number;
  equityPrevClose: number;
  equitySourceLabel: string;
  volSourceLabel: string;
}): SpxVixDayMove | null {
  if (!(input.volLast > 0) || !(input.volPrevClose > 0)) return null;
  if (!(input.equityLast > 0) || !(input.equityPrevClose > 0)) return null;
  const dailyImpliedSigmaPct = vixImpliedDailyOneSigmaPct(input.volPrevClose);
  if (dailyImpliedSigmaPct == null) return null;
  const spxChangePct = changePctFromPrevClose(input.equityLast, input.equityPrevClose);
  if (spxChangePct == null) return null;
  return {
    spxLast: input.equityLast,
    spxPrevClose: input.equityPrevClose,
    spxChangePct,
    vixLast: input.volLast,
    vixPrevClose: input.volPrevClose,
    dailyImpliedSigmaPct,
    spxSourceLabel: input.equitySourceLabel,
    vixSourceLabel: input.volSourceLabel,
  };
}

export function buildSpxVixDayMove(
  vix: TvSymbolQuote,
  spx: TvSymbolQuote,
): SpxVixDayMove | null {
  if (vix.close == null || vix.prevClose == null || vix.prevClose <= 0) return null;
  if (spx.close == null || spx.prevClose == null || spx.prevClose <= 0) return null;
  return buildEquityVolDayMove({
    volLast: vix.close,
    volPrevClose: vix.prevClose,
    equityLast: spx.close,
    equityPrevClose: spx.prevClose,
    equitySourceLabel: `TradingView ${spx.symbol}`,
    volSourceLabel: `TradingView ${vix.symbol}`,
  });
}
