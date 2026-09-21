/**
 * @deprecated Local PoC re-exports — production uses `sources/eu500AvanzaFallback.ts`.
 */

export {
  EU500_AVANZA_ORDERBOOK_ID as AVANZA_EU500_ORDERBOOK_ID,
  EU500_YAHOO_TICKER,
  fetchEu500AvanzaDailyHistory,
} from "../sources/eu500AvanzaFallback";

import type { EquityHistoryPoint } from "../types";
import {
  EU500_AVANZA_ORDERBOOK_ID,
  fetchEu500AvanzaDailyHistory,
} from "../sources/eu500AvanzaFallback";

export type Eu500RetailSource = "avanza";

export type Eu500RetailQuote = Readonly<{
  source: Eu500RetailSource;
  orderBookId: string;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  history: readonly EquityHistoryPoint[];
  dayLow: number | null;
  dayHigh: number | null;
  error?: string;
}>;

/** Dev diagnostic wrapper around the production chart fetch. */
export async function fetchEu500FromAvanza(): Promise<Eu500RetailQuote> {
  const history = await fetchEu500AvanzaDailyHistory();
  if (!history || history.length < 2) {
    return {
      source: "avanza",
      orderBookId: EU500_AVANZA_ORDERBOOK_ID,
      price: null,
      previousClose: null,
      changePercent: null,
      history: history ?? [],
      dayLow: null,
      dayHigh: null,
      error: "Avanza fetch failed",
    };
  }

  const price = history.at(-1)?.price ?? null;
  const previousClose = history.at(-2)?.price ?? null;
  const changePercent =
    price != null && previousClose != null && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  return {
    source: "avanza",
    orderBookId: EU500_AVANZA_ORDERBOOK_ID,
    price,
    previousClose,
    changePercent,
    history,
    dayLow: null,
    dayHigh: null,
  };
}
