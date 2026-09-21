import { impliedVolBlack76 } from "./black76";
import { parseUtcDate, weekdayCountExclusiveStart } from "./dates";
import { isPlausibleIvDecimal } from "./impliedVol";
import type { ListedOptionQuote } from "./listedOptionsIv";
import type { Omxs30OptionChain } from "./nasdaqNordicOptions";

const NN_PUBLIC = "https://public.nordnet.se/api/2";
const FETCH_TIMEOUT_MS = 20_000;
const MIN_TDTE = 5;
const MAX_TDTE = 40;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type NnPrice = { price?: number };
type NnOption = {
  instrument_info?: { symbol?: string };
  price_info?: { bid?: NnPrice; ask?: NnPrice };
  derivative_info?: { expire_date?: number };
};
type NnPair = {
  strike_price?: number;
  call_option?: NnOption;
  put_option?: NnOption;
};
type NnPairsJson = { results?: NnPair[] };
type NnAttrValue = { id?: string; name?: string; count?: number };
type NnAttributesJson = {
  attributes?: Array<{
    id?: string;
    filter_details?: { values?: NnAttrValue[] };
  }>;
};

function nnHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": UA,
    "client-id": "NEXT",
    "Accept-Language": "sv",
  };
}

function nnPositivePrice(side: NnPrice | undefined): number | null {
  const n = side?.price;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function mid(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null) return (bid + ask) / 2;
  return null;
}

export function nordnetExpireIso(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function yearFractionAct365(fromIso: string, toIso: string): number {
  const from = parseUtcDate(fromIso);
  const to = parseUtcDate(toIso);
  if (!from || !to || to <= from) return 0;
  return (to.getTime() - from.getTime()) / (365 * 24 * 3600 * 1000);
}

function isRegularOmxs30Symbol(symbol: string): boolean {
  return symbol.startsWith("OMXS30") && !symbol.startsWith("YXS30");
}

async function nnJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: nnHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nordnet HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchNordnetOmxs30Expiries(): Promise<Array<{ id: string; iso: string }>> {
  const url =
    `${NN_PUBLIC}/instrument_search/attributes?apply_filters=` +
    `${encodeURIComponent("currency=SEK|underlying_symbol=OMXS30")}` +
    `&entity_type=OPTIONLIST&expand=expire_date`;
  const json = await nnJson<NnAttributesJson>(url);
  const expire = (json.attributes ?? []).find((a) => a.id === "expire_date");
  const out: Array<{ id: string; iso: string }> = [];
  for (const value of expire?.filter_details?.values ?? []) {
    const id = String(value.id ?? "");
    const iso = nordnetExpireIso(Number(id));
    if (id && iso) out.push({ id, iso });
  }
  return out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
}

export function nordnetPairToListedQuotes(
  pair: NnPair,
  asOfDate: string,
  spot: number,
): ListedOptionQuote[] {
  const strike = pair.strike_price;
  if (!(typeof strike === "number") || !(strike > 0)) return [];
  const sides: Array<{ opt: NnOption | undefined; type: "call" | "put" }> = [
    { opt: pair.call_option, type: "call" },
    { opt: pair.put_option, type: "put" },
  ];
  const out: ListedOptionQuote[] = [];
  for (const { opt, type } of sides) {
    const symbol = opt?.instrument_info?.symbol ?? "";
    if (!isRegularOmxs30Symbol(symbol)) continue;
    const expiry = nordnetExpireIso(Number(opt?.derivative_info?.expire_date));
    const bid = nnPositivePrice(opt?.price_info?.bid);
    const ask = nnPositivePrice(opt?.price_info?.ask);
    const price = mid(bid, ask);
    if (!expiry || price == null) continue;
    const T = yearFractionAct365(asOfDate, expiry);
    if (!(T > 0)) continue;
    const iv = impliedVolBlack76(price, spot, strike, T, type === "call");
    if (iv == null || !isPlausibleIvDecimal(iv)) continue;
    out.push({ symbol, expiry, type, strike, iv, root: "OMXS30", bid, ask });
  }
  return out;
}

/**
 * Regular OMXS30 index options from Nordnet's public option-pair API.
 * Discovers expiries dynamically; uses bid/ask midpoint + Black-76.
 * YXS30 dailies are ignored until they actually list.
 */
export async function fetchNordnetOmxs30OptionQuotes(
  asOfDate: string,
  spot: number,
): Promise<Omxs30OptionChain> {
  const expiries = await fetchNordnetOmxs30Expiries();
  const usable = expiries.filter((row) => {
    const tdte = weekdayCountExclusiveStart(asOfDate, row.iso);
    return tdte >= MIN_TDTE && tdte <= MAX_TDTE;
  });
  if (!usable.length) throw new Error("Nordnet listed no OMXS30 expiries bracketing 20D");

  const pages = await Promise.all(
    usable.map((row) =>
      nnJson<NnPairsJson>(
        `${NN_PUBLIC}/instrument_search/query/optionlist/pairs?currency=SEK&expire_date=${encodeURIComponent(row.id)}&underlying_symbol=OMXS30`,
      ),
    ),
  );

  const quotes: ListedOptionQuote[] = [];
  for (const page of pages) {
    for (const pair of page.results ?? []) {
      quotes.push(...nordnetPairToListedQuotes(pair, asOfDate, spot));
    }
  }
  if (!quotes.length) {
    throw new Error("Nordnet OMXS30 chain had no usable two-sided bid/ask around ATM");
  }
  return {
    quotes,
    asOf: asOfDate,
    sourceLabel: "Nordnet OMXS30 listed options",
  };
}
