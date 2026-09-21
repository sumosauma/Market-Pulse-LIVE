import { parseTvSymbolQuote, type TvSymbolQuote } from "./tradingviewQuote";

const FETCH_TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FIELDS = "close,name,description,change,change_abs,prev_close_price,exchange,type,update_mode";

/**
 * Undocumented TradingView scanner quote used by the website.
 * Returns null on HTTP errors, missing symbols, or parse failures — never throws.
 */
export async function fetchTradingViewSymbol(symbol: string): Promise<TvSymbolQuote | null> {
  try {
    const url =
      "https://scanner.tradingview.com/symbol?symbol=" +
      encodeURIComponent(symbol) +
      `&fields=${FIELDS}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Origin: "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/",
        "User-Agent": UA,
      },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseTvSymbolQuote(symbol, json);
  } catch {
    return null;
  }
}
