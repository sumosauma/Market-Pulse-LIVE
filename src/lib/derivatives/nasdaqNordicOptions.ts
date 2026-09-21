import { impliedVolBlack76 } from "./black76";
import { parseUtcDate, thirdFridayUtc } from "./dates";
import { isPlausibleIvDecimal } from "./impliedVol";
import type { ListedOptionQuote } from "./listedOptionsIv";

const OMXS30_UNDERLYING_ISIN = "SE0000337842";
const LIST_PAGE = "https://tradereports.nasdaq.com/optionsandfutures/derivatives/pre-trade";
const DOWNLOAD =
  "https://tradereports.nasdaq.com/api/regulatory/trade-report/download";
const FETCH_TIMEOUT_MS = 30_000;
const MIN_PRETRADE_BYTES = 100_000;
const SESSION_SNAPSHOTS_TO_TRY = 3;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CALL_MONTH: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10, K: 11, L: 12,
};
const PUT_MONTH: Record<string, number> = {
  M: 1, N: 2, O: 3, P: 4, Q: 5, R: 6, S: 7, T: 8, U: 9, V: 10, W: 11, X: 12,
};

const WEEKLY_OPTION_NAME = /^OMXS30(\d)([A-X])(\d{1,2})Y(\d+)$/;
const MONTHLY_OPTION_NAME = /^OMXS30(\d)([A-X])(\d+)$/;
const FUTURE_NAME = /^OMXS30(\d)([A-L])$/;

type QuoteSides = { bid: number | null; ask: number | null };
type ParsedOption = {
  name: string;
  expiry: string;
  type: "call" | "put";
  strike: number;
  year: number;
  month: number;
  letter: string;
  weekly: boolean;
};

function tvHeaders(): HeadersInit {
  return {
    Accept: "*/*",
    "User-Agent": UA,
    Referer: LIST_PAGE,
    Origin: "https://tradereports.nasdaq.com",
  };
}

function parseNum(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveOmxs30Year(digit: number, asOfYear: number): number {
  let year = 2020 + digit;
  while (year < asOfYear) year += 10;
  while (year > asOfYear + 8) year -= 10;
  return year;
}

export function utcYearMonthDay(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

function optionTypeFromLetter(letter: string): { type: "call" | "put"; month: number } | null {
  const callMonth = CALL_MONTH[letter];
  const putMonth = PUT_MONTH[letter];
  const type = callMonth ? "call" : putMonth ? "put" : null;
  const month = callMonth ?? putMonth ?? null;
  if (!type || month == null) return null;
  return { type, month };
}

export function parseOmxs30OptionName(name: string, asOfYear: number): ParsedOption | null {
  if (!name.startsWith("OMXS30") || name.startsWith("YXS30")) return null;
  const weekly = name.match(WEEKLY_OPTION_NAME);
  if (weekly) {
    const typed = optionTypeFromLetter(weekly[2]!);
    if (!typed) return null;
    const year = resolveOmxs30Year(Number(weekly[1]), asOfYear);
    const expiry = utcYearMonthDay(year, typed.month, Number(weekly[3]));
    if (!expiry) return null;
    return {
      name,
      expiry,
      type: typed.type,
      strike: Number(weekly[4]),
      year,
      month: typed.month,
      letter: weekly[2]!,
      weekly: true,
    };
  }
  const monthly = name.match(MONTHLY_OPTION_NAME);
  if (!monthly) return null;
  const typed = optionTypeFromLetter(monthly[2]!);
  if (!typed) return null;
  const year = resolveOmxs30Year(Number(monthly[1]), asOfYear);
  const expiry = thirdFridayUtc(year, typed.month);
  if (!expiry) return null;
  return {
    name,
    expiry,
    type: typed.type,
    strike: Number(monthly[3]),
    year,
    month: typed.month,
    letter: monthly[2]!,
    weekly: false,
  };
}

export function parseOmxs30FutureName(
  name: string,
  asOfYear: number,
): { expiry: string; year: number; month: number } | null {
  const m = name.match(FUTURE_NAME);
  if (!m) return null;
  const month = CALL_MONTH[m[2]!];
  if (month == null) return null;
  const year = resolveOmxs30Year(Number(m[1]), asOfYear);
  const expiry = thirdFridayUtc(year, month);
  if (!expiry) return null;
  return { expiry, year, month };
}

function yearFractionAct365(fromIso: string, toIso: string): number {
  const from = parseUtcDate(fromIso);
  const to = parseUtcDate(toIso);
  if (!from || !to || to <= from) return 0;
  return (to.getTime() - from.getTime()) / (365 * 24 * 3600 * 1000);
}

function mid(sides: QuoteSides): number | null {
  if (sides.bid != null && sides.ask != null) return (sides.bid + sides.ask) / 2;
  return null;
}

/** Prefer last full session :59 snapshots over empty post-close crumbs. */
export function selectNasdaqPretradeFiles(reports: readonly string[]): string[] {
  const sessionSnaps = reports.filter((name) =>
    /NordicDerivatives-pretrade-\d{4}-\d{2}-\d{2}T(0[8-9]|1[0-6])59$/.test(name),
  );
  if (sessionSnaps.length > 0) return sessionSnaps.slice(0, SESSION_SNAPSHOTS_TO_TRY);
  const session = reports.filter((name) =>
    /NordicDerivatives-pretrade-\d{4}-\d{2}-\d{2}T(0[8-9]|1[0-6])\d{2}$/.test(name),
  );
  if (session.length > 0) return session.slice(0, SESSION_SNAPSHOTS_TO_TRY);
  return reports.slice(0, SESSION_SNAPSHOTS_TO_TRY);
}

export function nasdaqPretradeAsOf(fileName: string): string | null {
  const m = fileName.match(/NordicDerivatives-pretrade-(\d{4}-\d{2}-\d{2})T/);
  return m?.[1] ?? null;
}

async function listPretradeFiles(): Promise<string[]> {
  const res = await fetch(
    "https://tradereports.nasdaq.com/api/regulatory/trade-reports?type=PRE_TRADE&assetClass=DERIVATIVES",
    {
      headers: { ...tvHeaders(), Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Nasdaq tradereports list HTTP ${res.status}`);
  const json = (await res.json()) as { reports?: unknown };
  const names = Array.isArray(json.reports)
    ? json.reports.filter((name): name is string => typeof name === "string" && name.startsWith("NordicDerivatives-pretrade-"))
    : [];
  return names;
}

async function downloadPretradeCsv(fileName: string): Promise<string> {
  const url =
    `${DOWNLOAD}?type=PRE_TRADE&assetClass=DERIVATIVES&fileName=${encodeURIComponent(fileName)}`;
  const res = await fetch(url, {
    headers: tvHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nasdaq tradereports CSV HTTP ${res.status}`);
  return res.text();
}

function mergeCsv(
  csv: string,
  asOfYear: number,
  options: Map<string, QuoteSides>,
  futures: Map<string, QuoteSides>,
): void {
  const lines = csv.split(/\r?\n/);
  for (const line of lines) {
    const p = line.split(";");
    if (p.length < 11) continue;
    if (p[10] !== OMXS30_UNDERLYING_ISIN) continue;
    const name = p[1] ?? "";
    const bid = parseNum(p[4] ?? "");
    const ask = parseNum(p[7] ?? "");
    if (parseOmxs30FutureName(name, asOfYear)) {
      const prev = futures.get(name) ?? { bid: null, ask: null };
      futures.set(name, { bid: bid ?? prev.bid, ask: ask ?? prev.ask });
      continue;
    }
    if (!parseOmxs30OptionName(name, asOfYear)) continue;
    const prev = options.get(name) ?? { bid: null, ask: null };
    options.set(name, { bid: bid ?? prev.bid, ask: ask ?? prev.ask });
  }
}

export type Omxs30OptionChain = {
  quotes: ListedOptionQuote[];
  asOf: string;
  sourceLabel: string;
};

/**
 * OMXS30 listed options from Nasdaq Nordic MiFIR delayed pre-trade CSVs.
 * Uses regular OMXS30 monthly and weekly series (not YXS30 dailies).
 * IV is inverted from two-sided bid/ask mids (the files do not publish IV).
 * Futures quotes are used only as the forward for inversion — never as IV20.
 */
export async function fetchNasdaqOmxs30OptionQuotes(
  asOfDate: string,
  spot: number,
): Promise<Omxs30OptionChain> {
  const files = await listPretradeFiles();
  if (!files.length) throw new Error("Nasdaq tradereports has no derivatives pre-trade files");
  const asOfYear = Number(asOfDate.slice(0, 4));
  const optionSides = new Map<string, QuoteSides>();
  const futureSides = new Map<string, QuoteSides>();

  const toFetch = selectNasdaqPretradeFiles(files);
  const csvs = await Promise.all(toFetch.map((name) => downloadPretradeCsv(name)));
  const used: string[] = [];
  for (let i = 0; i < csvs.length; i++) {
    const csv = csvs[i]!;
    if (csv.length < MIN_PRETRADE_BYTES) continue;
    mergeCsv(csv, asOfYear, optionSides, futureSides);
    used.push(toFetch[i]!);
  }
  if (!used.length) {
    throw new Error("Nasdaq OMXS30 pre-trade session snapshot missing (post-close files are empty)");
  }

  const forwardByExpiry = new Map<string, number>();
  for (const [name, sides] of futureSides) {
    const parsed = parseOmxs30FutureName(name, asOfYear);
    const fwd = mid(sides) ?? sides.bid ?? sides.ask;
    if (!parsed || fwd == null) continue;
    forwardByExpiry.set(parsed.expiry, fwd);
  }

  const snapshotAsOf = nasdaqPretradeAsOf(used[0]!) ?? asOfDate;
  const out: ListedOptionQuote[] = [];
  for (const [name, sides] of optionSides) {
    const parsed = parseOmxs30OptionName(name, asOfYear);
    const price = mid(sides);
    if (!parsed || price == null) continue;
    const T = yearFractionAct365(snapshotAsOf, parsed.expiry);
    if (!(T > 0)) continue;
    const forward = forwardByExpiry.get(parsed.expiry) ?? spot;
    const iv = impliedVolBlack76(price, forward, parsed.strike, T, parsed.type === "call");
    if (iv == null || !isPlausibleIvDecimal(iv)) continue;
    out.push({
      symbol: name,
      expiry: parsed.expiry,
      type: parsed.type,
      strike: parsed.strike,
      iv,
      root: "OMXS30",
      bid: sides.bid,
      ask: sides.ask,
    });
  }
  if (!out.length) throw new Error("Nasdaq OMXS30 pre-trade file had no usable two-sided option quotes");
  return {
    quotes: out,
    asOf: snapshotAsOf,
    sourceLabel: "Nasdaq Nordic delayed pre-trade",
  };
}
