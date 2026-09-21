import { parseTvSymbolQuote, type TvSymbolQuote } from "./tradingviewQuote";

const FETCH_TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FIELDS = "close,name,description,change,change_abs,prev_close_price,exchange,type,update_mode";

async function fetchTradingViewSymbolJson(symbol: string, fields: string): Promise<unknown | null> {
  const url =
    "https://scanner.tradingview.com/symbol?symbol=" +
    encodeURIComponent(symbol) +
    `&fields=${encodeURIComponent(fields)}`;
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
  return res.json();
}

/**
 * Undocumented TradingView scanner quote used by the website.
 * Returns null on HTTP errors, missing symbols, or parse failures — never throws.
 */
export async function fetchTradingViewSymbol(symbol: string): Promise<TvSymbolQuote | null> {
  try {
    const json = await fetchTradingViewSymbolJson(symbol, FIELDS);
    if (json == null) return null;
    return parseTvSymbolQuote(symbol, json);
  } catch {
    return null;
  }
}

/** Same scanner request with caller-selected fields. Null on HTTP or network failure. */
export async function fetchTradingViewSymbolFields(
  symbol: string,
  fields: string,
): Promise<Record<string, unknown> | null> {
  try {
    const json = await fetchTradingViewSymbolJson(symbol, fields);
    if (!json || typeof json !== "object") return null;
    const row = json as Record<string, unknown>;
    if (row.code === "symbol_not_exists") return null;
    return row;
  } catch {
    return null;
  }
}
