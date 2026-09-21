import { addUtcDays, isoToYyyymmdd, yyyymmddToIso } from "./dates";
import type { ListedOptionQuote } from "./listedOptionsIv";
import { fetchTradingViewSymbol } from "./tradingviewScanner";

const FETCH_TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const COLUMNS = ["iv", "expiration", "option-type", "strike", "root", "bid", "ask"] as const;

type Scan2Json = {
  totalCount?: number;
  fields?: string[];
  symbols?: Array<{ s?: string; f?: unknown[] }>;
  error?: string;
};

function tvHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://www.tradingview.com",
    Referer: "https://www.tradingview.com/",
    "User-Agent": UA,
  };
}

function readNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRow(item: { s?: string; f?: unknown[] }): ListedOptionQuote | null {
  const f = item.f ?? [];
  const iv = readNum(f[0]);
  const exp = readNum(f[1]);
  const typeRaw = typeof f[2] === "string" ? f[2].toLowerCase() : "";
  const strike = readNum(f[3]);
  const root = typeof f[4] === "string" ? f[4] : "";
  const type = typeRaw === "call" || typeRaw === "put" ? typeRaw : null;
  const expiry = exp != null ? yyyymmddToIso(exp) : null;
  if (iv == null || strike == null || !type || !expiry || !item.s) return null;
  return {
    symbol: item.s,
    expiry,
    type,
    strike,
    iv,
    root,
    bid: readNum(f[5]),
    ask: readNum(f[6]),
  };
}

export async function fetchTradingViewOptionsChain(
  underlying: string,
  asOfDate: string,
  opts: { allowEmpty?: boolean; spot?: number } = {},
): Promise<ListedOptionQuote[]> {
  const extra: Array<{ expression: { left: string; operation: string; right: unknown } }> = [];
  if (opts.spot != null && opts.spot > 0) {
    extra.push({
      expression: {
        left: "strike",
        operation: "in_range",
        right: [opts.spot * 0.96, opts.spot * 1.04],
      },
    });
  }
  return scanOptions(asOfDate, [{ name: "underlying_symbol", values: [underlying] }], extra, opts);
}

/** Scan listed options by root (no underlying required). Empty array if none. */
export async function fetchTradingViewOptionsByRoot(
  root: string,
  asOfDate: string,
): Promise<ListedOptionQuote[]> {
  return scanOptions(
    asOfDate,
    [],
    [{ expression: { left: "root", operation: "equal", right: root } }],
    { allowEmpty: true },
  );
}

/** Scan listed options whose description contains `needle`. Empty array if none. */
export async function fetchTradingViewOptionsByDescription(
  needle: string,
  asOfDate: string,
): Promise<ListedOptionQuote[]> {
  return scanOptions(
    asOfDate,
    [],
    [{ expression: { left: "description", operation: "match", right: needle } }],
    { allowEmpty: true },
  );
}

async function scanOptions(
  asOfDate: string,
  indexFilters: Array<{ name: string; values: string[] }>,
  extraOperands: Array<{ expression: { left: string; operation: string; right: unknown } }>,
  opts: { allowEmpty?: boolean } = {},
): Promise<ListedOptionQuote[]> {
  const fromIso = addUtcDays(asOfDate, 6) ?? asOfDate;
  const toIso = addUtcDays(asOfDate, 56) ?? asOfDate;
  const from = isoToYyyymmdd(fromIso);
  const to = isoToYyyymmdd(toIso);
  const body: Record<string, unknown> = {
    columns: [...COLUMNS],
    ignore_unknown_fields: false,
    filter2: {
      operator: "and",
      operands: [
        { expression: { left: "type", operation: "equal", right: "option" } },
        ...(from != null && to != null
          ? [{ expression: { left: "expiration", operation: "in_range", right: [from, to] } }]
          : []),
        ...extraOperands,
      ],
    },
    range: [0, 5000],
  };
  if (indexFilters.length) body.index_filters = indexFilters;

  const res = await fetch("https://scanner.tradingview.com/options/scan2?label-product=options-builder", {
    method: "POST",
    headers: tvHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`TradingView options HTTP ${res.status}`);
  const json = (await res.json()) as Scan2Json;
  if (json.error) throw new Error(json.error);
  const rows: ListedOptionQuote[] = [];
  for (const item of json.symbols ?? []) {
    const parsed = parseRow(item);
    if (parsed) rows.push(parsed);
  }
  if (!rows.length && !opts.allowEmpty) {
    const hint = indexFilters[0]?.values[0] ?? "scan";
    throw new Error(`TradingView options chain empty for ${hint}`);
  }
  return rows;
}

export async function fetchTradingViewUnderlyingSpot(symbol: string): Promise<number> {
  const quote = await fetchTradingViewSymbol(symbol);
  if (quote?.close == null) throw new Error(`TradingView spot missing for ${symbol}`);
  return quote.close;
}
