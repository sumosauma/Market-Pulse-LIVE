export type TvSymbolQuote = {
  symbol: string;
  name: string | null;
  description: string | null;
  close: number | null;
  changePct: number | null;
  changeAbs: number | null;
  prevClose: number | null;
  exchange: string | null;
  type: string | null;
  updateMode: string | null;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseTvSymbolQuote(symbol: string, json: unknown): TvSymbolQuote | null {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  if (row.code === "symbol_not_exists") return null;
  const close = readNumber(row.close);
  if (close == null) return null;
  const changeAbs = readNumber(row.change_abs);
  const prevCloseField = readNumber(row.prev_close_price);
  const derivedPrev =
    changeAbs != null && Number.isFinite(close - changeAbs) ? close - changeAbs : null;
  const prevClose =
    prevCloseField != null && prevCloseField > 0
      ? prevCloseField
      : derivedPrev != null && derivedPrev > 0
        ? derivedPrev
        : null;
  return {
    symbol,
    name: readString(row.name),
    description: readString(row.description),
    close,
    changePct: readNumber(row.change),
    changeAbs,
    prevClose,
    exchange: readString(row.exchange),
    type: readString(row.type),
    updateMode: readString(row.update_mode),
  };
}

export function isIndexQuote(quote: TvSymbolQuote): boolean {
  return quote.type === "index";
}
