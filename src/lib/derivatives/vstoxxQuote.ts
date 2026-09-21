/** EURO STOXX 50 Volatility Index (VSTOXX). Cash index only — never futures/ETFs/ETNs. */
export const VSTOXX_SYMBOL = "V2TX";
export const VSTOXX_ISIN = "DE000A0C3QF1";

export const VSTOXX_STOXX_EOD_URL =
  "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_v2tx.txt";
export const VSTOXX_MARKETS_INSIDER_URL = "https://markets.businessinsider.com/index/vstoxx";

/** Official previous-close band: 0.05 points or 0.5% of the official close, whichever is larger. */
const PREV_CLOSE_ABS_TOL = 0.05;
const PREV_CLOSE_REL_TOL = 0.005;

const PROXY_LABEL_RE = /\bfvs\b|future|futures|etf|etn|certificate|zertifikat/i;
const VSTOXX_LABEL_RE = /vstoxx/i;

export type StoxxV2txClose = {
  date: string;
  close: number;
};

export type MarketsInsiderVstoxxQuote = {
  last: number;
  previousClose: number | null;
  label: string;
  category: string | null;
  isFuture: boolean | null;
};

export type VstoxxPrevCloseCheck = "passed" | "skipped" | "failed" | "not_applicable";

export type VstoxxQuoteKind = "intraday" | "eod";

export type VstoxxResolved = {
  last: number;
  prevClose: number;
  changePct: number;
  kind: VstoxxQuoteKind;
  lastSource: string;
  prevCloseSource: string;
  prevCloseCrossCheck: VstoxxPrevCloseCheck;
  eodDate: string;
  priorEodDate: string | null;
  latestEodClose: number | null;
  priorEodClose: number | null;
};

export function parseStoxxV2txHistory(text: string): StoxxV2txClose[] {
  const rows: StoxxV2txClose[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("date")) continue;
    const parts = line.split(";");
    if (parts.length < 3) continue;
    const symbol = (parts[1] ?? "").trim().toUpperCase();
    if (symbol !== VSTOXX_SYMBOL) continue;
    const close = Number((parts[2] ?? "").trim().replace(",", "."));
    const date = parseStoxxDate((parts[0] ?? "").trim());
    if (date == null || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function latestTwoV2txCloses(
  rows: readonly StoxxV2txClose[],
): { latest: StoxxV2txClose; prior: StoxxV2txClose | null } | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1]!;
  const prior = rows.length >= 2 ? rows[rows.length - 2]! : null;
  return { latest, prior };
}

export function parseMarketsInsiderVstoxxHtml(html: string): MarketsInsiderVstoxxQuote | null {
  for (const row of extractPriceSectionObjects(html)) {
    const quote = readCashVstoxxPriceSection(row);
    if (quote) return quote;
  }
  return null;
}

export function isCashVstoxxIndex(quote: MarketsInsiderVstoxxQuote): boolean {
  if (quote.isFuture === true) return false;
  if (!VSTOXX_LABEL_RE.test(quote.label) || PROXY_LABEL_RE.test(quote.label)) return false;
  if (quote.category != null && quote.category.toLowerCase() !== "index") return false;
  if (!Number.isFinite(quote.last) || quote.last < 4 || quote.last > 150) return false;
  return true;
}

export function previousCloseAgrees(official: number, vendor: number): boolean {
  if (!(official > 0) || !Number.isFinite(vendor) || vendor <= 0) return false;
  const abs = Math.abs(vendor - official);
  const tol = Math.max(PREV_CLOSE_ABS_TOL, PREV_CLOSE_REL_TOL * official);
  return abs <= tol;
}

export function vstoxxChangePct(last: number, prevClose: number): number | null {
  if (!Number.isFinite(last) || !Number.isFinite(prevClose) || !(prevClose > 0)) return null;
  return ((last - prevClose) / prevClose) * 100;
}

/** Prior completed VSTOXX session close used for daily 1σ (same role as prior VIX close). */
export function vstoxxPriorSessionClose(resolved: VstoxxResolved, asOfDay: string): number {
  if (resolved.latestEodClose != null && resolved.eodDate) {
    if (resolved.eodDate < asOfDay) return resolved.latestEodClose;
    if (resolved.priorEodClose != null && resolved.priorEodClose > 0) return resolved.priorEodClose;
    return resolved.latestEodClose;
  }
  return resolved.prevClose;
}

function eodMeta(eod: { latest: StoxxV2txClose; prior: StoxxV2txClose | null }) {
  return {
    eodDate: eod.latest.date,
    priorEodDate: eod.prior?.date ?? null,
    latestEodClose: eod.latest.close,
    priorEodClose: eod.prior?.close ?? null,
  };
}

export function resolveVstoxxQuote(
  eod: { latest: StoxxV2txClose; prior: StoxxV2txClose | null } | null,
  intraday: MarketsInsiderVstoxxQuote | null,
): VstoxxResolved | null {
  if (eod) {
    const officialPrev = eod.latest.close;
    const officialPrevSource = `STOXX ${VSTOXX_SYMBOL} EOD ${eod.latest.date}`;
    let rejectedIntradayCheck: VstoxxPrevCloseCheck | null = null;

    if (intraday && isCashVstoxxIndex(intraday)) {
      const check =
        intraday.previousClose == null
          ? "skipped"
          : previousCloseAgrees(officialPrev, intraday.previousClose)
            ? "passed"
            : "failed";
      if (check !== "failed") {
        const changePct = vstoxxChangePct(intraday.last, officialPrev);
        if (changePct != null) {
          return {
            last: intraday.last,
            prevClose: officialPrev,
            changePct,
            kind: "intraday",
            lastSource: "Markets Insider VSTOXX cash index",
            prevCloseSource: officialPrevSource,
            prevCloseCrossCheck: check,
            ...eodMeta(eod),
          };
        }
      } else {
        rejectedIntradayCheck = "failed";
      }
    }

    if (eod.prior == null) return null;
    const changePct = vstoxxChangePct(eod.latest.close, eod.prior.close);
    if (changePct == null) return null;
    return {
      last: eod.latest.close,
      prevClose: eod.prior.close,
      changePct,
      kind: "eod",
      lastSource: `STOXX ${VSTOXX_SYMBOL} EOD ${eod.latest.date} (previous session)`,
      prevCloseSource: `STOXX ${VSTOXX_SYMBOL} EOD ${eod.prior.date}`,
      prevCloseCrossCheck: rejectedIntradayCheck ?? "not_applicable",
      ...eodMeta(eod),
    };
  }

  if (!intraday || !isCashVstoxxIndex(intraday) || intraday.previousClose == null) return null;
  const changePct = vstoxxChangePct(intraday.last, intraday.previousClose);
  if (changePct == null) return null;
  return {
    last: intraday.last,
    prevClose: intraday.previousClose,
    changePct,
    kind: "intraday",
    lastSource: "Markets Insider VSTOXX cash index",
    prevCloseSource: "Markets Insider previous close (STOXX EOD unavailable)",
    prevCloseCrossCheck: "skipped",
    eodDate: "",
    priorEodDate: null,
    latestEodClose: null,
    priorEodClose: null,
  };
}

function parseStoxxDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractPriceSectionObjects(html: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const needle = "priceSection:";
  let from = 0;
  while (from < html.length) {
    const i = html.indexOf(needle, from);
    if (i < 0) break;
    let j = i + needle.length;
    while (j < html.length && /\s/.test(html[j]!)) j += 1;
    if (html.startsWith("null", j)) {
      from = j + 4;
      continue;
    }
    if (html[j] !== "{") {
      from = j + 1;
      continue;
    }
    const json = sliceBalancedObject(html, j);
    if (!json) {
      from = j + 1;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rows.push(parsed as Record<string, unknown>);
      }
    } catch {
      /* skip malformed blobs */
    }
    from = j + json.length;
  }
  return rows;
}

function sliceBalancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function readCashVstoxxPriceSection(row: Record<string, unknown>): MarketsInsiderVstoxxQuote | null {
  const label = readString(row.label);
  if (!label) return null;
  const last = readNumber(row.currentValue);
  if (last == null) return null;
  const isFuture = typeof row.isFuture === "boolean" ? row.isFuture : null;
  const quote: MarketsInsiderVstoxxQuote = {
    last,
    previousClose: readNumber(row.previousClose),
    label,
    category: readString(row.category),
    isFuture,
  };
  return isCashVstoxxIndex(quote) ? quote : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
