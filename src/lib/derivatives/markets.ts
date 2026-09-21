import type { DerivativesMarketId } from "./types";

export const RV20_WINDOW = 20;
export const TRADING_DAYS_PER_YEAR = 252;
export const IV20_TARGET_TDTE = 20;

export type DerivativesMarketDef = Readonly<{
  id: DerivativesMarketId;
  label: string;
  countryId: string;
  /** Yahoo Finance daily close ticker used for RV20. */
  yahooTicker: string;
  /** FRED daily close fallback for RV20, if Yahoo fails. */
  fredFallbackId: string | null;
  hasListedOptionsIv20: boolean;
  ivUnavailableReason: string | null;
}>;

/**
 * RV20: Yahoo daily index closes (same chart endpoint as Equities / Market Monitor).
 * IV20: only a listed-options implied-vol feed counts — never RV, VIX, VSTOXX, or iv30.
 */
export const DERIVATIVES_MARKETS: readonly DerivativesMarketDef[] = [
  {
    id: "spx",
    label: "S&P 500",
    countryId: "US",
    yahooTicker: "^GSPC",
    fredFallbackId: "SP500",
    hasListedOptionsIv20: true,
    ivUnavailableReason: null,
  },
  {
    id: "sx5e",
    label: "Euro Stoxx 50",
    countryId: "EU",
    yahooTicker: "^STOXX50E",
    fredFallbackId: null,
    hasListedOptionsIv20: true,
    ivUnavailableReason: null,
  },
  {
    id: "omxs30",
    label: "OMXS30",
    countryId: "SE",
    yahooTicker: "^OMX",
    fredFallbackId: null,
    hasListedOptionsIv20: true,
    ivUnavailableReason:
      "OMXS30 listed-options bid/ask unavailable for 20D ATM IV (regular OMXS30 series; YXS30 dailies not live).",
  },
];
