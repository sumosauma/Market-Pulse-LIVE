import { exchangeTzFromRow, type ExchangeTz } from "./equityExchangeTz";
import { isWithinCashTradingSession } from "./equitySessionWindow";
import type { EquityMarketStatus } from "./types";

/** Max quote age (minutes) to treat REGULAR session as Market Open. */
const OPEN_MAX_AGE_MIN = 45;
/** Quote age beyond this (minutes) → Stale (~7 calendar days). */
const STALE_AGE_MIN = 7 * 24 * 60;

export type EquityStatusInput = Readonly<{
  price: number | null;
  /** 1D % — required for Market Open / Market Closed / Stale labels. */
  changePercent?: number | null;
  regularMarketTime?: number | null;
  marketState?: string | null;
  exchangeTimezoneName?: string | null;
  gmtoffset?: number | null;
  /** Registry country id — used for session-window open inference. */
  countryId?: string | null;
  region?: string | null;
  /** Yahoo ticker — used for exchange timezone overrides. */
  ticker?: string | null;
}>;

function exchangeTzFromInput(input: EquityStatusInput): ExchangeTz {
  return exchangeTzFromRow({
    ticker: input.ticker ?? null,
    exchangeTimezoneName: input.exchangeTimezoneName ?? null,
    gmtoffset: input.gmtoffset ?? null,
    timezone: null,
  });
}

function isQuoteRecent(ageMin: number | null): boolean {
  return ageMin != null && ageMin <= OPEN_MAX_AGE_MIN;
}

/** Conservative market-state label from Yahoo quote metadata. */
export function deriveEquityMarketStatus(input: EquityStatusInput): EquityMarketStatus {
  if (input.price === null || !Number.isFinite(input.price)) {
    return "unavailable";
  }

  if (input.changePercent === null || !Number.isFinite(input.changePercent)) {
    return "unavailable";
  }

  const nowSec = Date.now() / 1000;
  const quoteTime = input.regularMarketTime;
  const ageMin = quoteTime != null && Number.isFinite(quoteTime) ? (nowSec - quoteTime) / 60 : null;

  if (ageMin != null && ageMin > STALE_AGE_MIN) {
    return "stale";
  }

  const state = String(input.marketState ?? "").toUpperCase();

  if (state === "REGULAR") {
    return isQuoteRecent(ageMin) ? "market_open" : "market_closed";
  }

  if (
    state === "PRE" ||
    state === "PREPRE" ||
    state === "POST" ||
    state === "POSTPOST" ||
    state === "CLOSED" ||
    state === "CLOSE"
  ) {
    return "market_closed";
  }

  if (quoteTime != null && isQuoteRecent(ageMin)) {
    const tz = exchangeTzFromInput(input);
    const countryId = input.countryId ?? "";

    if (
      countryId &&
      isWithinCashTradingSession(countryId, input.region ?? undefined, new Date().toISOString(), tz)
    ) {
      return "market_open";
    }
  }

  return "market_closed";
}

export function equityStatusLabel(status: EquityMarketStatus): string {
  switch (status) {
    case "market_open":
      return "Market Open";
    case "market_closed":
      return "Market Closed";
    case "stale":
      return "Stale";
    default:
      return "Unavailable";
  }
}

/** Row has usable quote data for map cards (price + 1D %). */
export function hasEquityQuoteData(row: {
  status: EquityMarketStatus;
  changePercent?: number | null;
}): boolean {
  return (
    row.status !== "unavailable" &&
    row.changePercent !== null &&
    Number.isFinite(row.changePercent)
  );
}
