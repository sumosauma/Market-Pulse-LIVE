import {
  EARLIER_QUOTE_MS,
  GOLD_MONTHS,
  GRAIN_MONTHS,
  HISTORY_CURVE_HORIZONS,
  MAX_CURVE_POINTS,
  MAX_QUOTE_AGE_VS_NEWEST_MS,
  MAX_SESSION_LOOKBACK_DAYS,
  MONTH_CODES,
  MONTH_SHORT,
  SILVER_MONTHS,
  buildListedSlots,
  calendarSpread,
  classifyFuturesCurve,
  contractAxisLabel,
  contractLabel,
  deliveryMonthStart,
  deliveryNameStatus,
  dropThinCurrentMonthFront,
  emptyHistoricalCurves,
  horizonEndUtc,
  nextGold,
  nextGrain,
  nextMonthly,
  nextSilver,
  parseContractSymbol,
  type FuturesContractPoint,
  type FuturesCurve,
  type FuturesTermStructure,
  type HistoricalCurve,
  type HistoryCurveHorizon,
} from "./futuresCurve";
import { fetchDailyBulletinSettlements } from "./futuresCurveDailyBulletin.server";
import { isFuturesContractActiveOnSession } from "./futuresCurveExpiry";
import {
  findCurveSnapshotOnOrBefore,
  saveCurveSnapshot,
  type SnapshotRow,
} from "./futuresCurveSnapshots";
import { calendarDaysBetween } from "./overview";

/** Official CME settlement strips (CmeWS JSON or Daily Bulletin PDF) — never Yahoo lasts. */
export const CME_SETTLEMENT_SOURCE_LABELS = ["CME settlements", "CME Daily Bulletin"] as const;

export function isOfficialCmeSettlementSource(sourceLabel: string | null | undefined): boolean {
  return (
    sourceLabel === "CME settlements" ||
    sourceLabel === "CME Daily Bulletin"
  );
}

/**
 * Measured 2026-11-25: CME Settlements JSON still returns strips ~6–7 calendar days
 * back from the latest session (e.g. Tue 11/24 → Wed 11/18). Older tradeDates return
 * empty settlements. Keep a small buffer above the measured depth.
 */
const CME_HISTORY_MAX_CALENDAR_DAYS = 10;
/** Weekday/holiday walk around the target approx when resolving 1d/1w/1m overlays. */
const HOLIDAY_WALK_EXTRA_DAYS = 4;

/** Yahoo / non-CmeWS fetches. */
const FETCH_TIMEOUT_MS = 12_000;
/**
 * CmeWS per-request timeout. Keep short so a blocked host (DigitalOcean) fails
 * into Daily Bulletin instead of burning sequential 12s lookbacks.
 */
const CME_FETCH_TIMEOUT_MS = 2_500;
/** After a transport/timeout failure, skip all CmeWS calls for this long. */
const CME_CIRCUIT_COOLDOWN_MS = 5 * 60_000;
/** Hard budget for the live CmeWS discovery phase across all products. */
const CME_LIVE_BUDGET_MS = 8_000;
/** Max calendar-day lookback when seeking the latest CME settlement publication. */
const CME_TRADE_DATE_LOOKBACK_DAYS = 6;
/**
 * Reject a CME strip whose trade date is older than this many calendar days
 * (weekends / holidays). Forces whole-curve Yahoo fallback instead of stale marks.
 */
const MAX_CME_SETTLEMENT_AGE_DAYS = 5;
/** UI / assembly window: 12M view + one reach-through month beyond the boundary. */
const CME_STRIP_HORIZON_MONTHS = 13;
const CME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Process-wide negative cache when CmeWS is unreachable (shared across commodities + history). */
let cmeCircuitOpenUntil = 0;

function cmeCircuitOpen(): boolean {
  return Date.now() < cmeCircuitOpenUntil;
}

function tripCmeCircuit(): void {
  cmeCircuitOpenUntil = Date.now() + CME_CIRCUIT_COOLDOWN_MS;
}

function clearCmeCircuit(): void {
  cmeCircuitOpenUntil = 0;
}

function isCmeTransportFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const name = err.name || "";
  const message = err.message || "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|certificate/i.test(
      `${name} ${message}`,
    )
  );
}

/** Test/audit helpers — not used by the UI path. */
export const __cmeCircuitTest = {
  isOpen: () => cmeCircuitOpen(),
  trip: () => tripCmeCircuit(),
  clear: () => clearCmeCircuit(),
  openUntil: () => cmeCircuitOpenUntil,
};

type Cycle = "monthly" | "grain" | "gold" | "silver";

export type FuturesCurveSpec = {
  id: string;
  name: string;
  root: string;
  venue: string;
  /** CME website product id for Settlements JSON. */
  cmeProductId: number;
  exchangeLabel: string;
  currency: string;
  unit: string;
  digits: number;
  cycle: Cycle;
  horizon: number;
  /**
   * When Yahoo omits the delivery month in the contract name, trust the echoed
   * symbol month code only for products where that encoding is exchange-standard
   * (NYMEX Brent last-day; NYMEX Dutch TTF calendar-month).
   */
  allowUnstatedMonth: boolean;
  productPhrase: string;
  contractNote: string;
  unavailableReason: string;
};

type CurveSpec = FuturesCurveSpec;

type SettlementHit = {
  year: number;
  monthIndex: number;
  price: number;
  volume: number;
  openInterest: number;
  sessionDate: string;
};

function cycleStep(cycle: Cycle) {
  if (cycle === "grain") return nextGrain;
  if (cycle === "gold") return nextGold;
  if (cycle === "silver") return nextSilver;
  return nextMonthly;
}

function cycleMonths(cycle: Cycle): ReadonlySet<number> | null {
  if (cycle === "grain") return new Set(GRAIN_MONTHS);
  if (cycle === "gold") return new Set(GOLD_MONTHS);
  if (cycle === "silver") return new Set(SILVER_MONTHS);
  return null;
}

export function futuresCurveSpecById(id: string): FuturesCurveSpec | undefined {
  return CURVES.find((spec) => spec.id === id);
}

const CURVES: CurveSpec[] = [
  {
    id: "brent",
    name: "Brent",
    root: "BZ",
    venue: "NYM",
    cmeProductId: 424,
    exchangeLabel: "NYMEX",
    currency: "USD",
    unit: "USD/bbl",
    digits: 2,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: true,
    productPhrase: "Brent Crude Oil Last Day",
    contractNote:
      "NYMEX Brent last-day financial futures. Curve marks are CME Group official settlements for one trade date.",
    unavailableReason: "Futures curve data unavailable. Not enough verified Brent contract months were returned.",
  },
  {
    id: "wti",
    name: "WTI",
    root: "CL",
    venue: "NYM",
    cmeProductId: 425,
    exchangeLabel: "NYMEX",
    currency: "USD",
    unit: "USD/bbl",
    digits: 2,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Crude Oil",
    contractNote: "NYMEX WTI crude oil futures. Curve marks are CME Group official settlements for one trade date.",
    unavailableReason: "Futures curve data unavailable. Not enough verified WTI contract months were returned.",
  },
  {
    id: "henry-hub",
    name: "Henry Hub",
    root: "NG",
    venue: "NYM",
    cmeProductId: 444,
    exchangeLabel: "NYMEX",
    currency: "USD",
    unit: "USD/MMBtu",
    digits: 3,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Natural Gas",
    contractNote:
      "NYMEX Henry Hub natural gas futures. Curve marks are CME Group official settlements for one trade date.",
    unavailableReason: "Futures curve data unavailable. Not enough verified Henry Hub contract months were returned.",
  },
  {
    id: "ttf",
    name: "TTF Natural Gas",
    root: "TTF",
    venue: "NYM",
    cmeProductId: 8378,
    exchangeLabel: "NYMEX",
    currency: "EUR",
    unit: "EUR/MWh",
    digits: 2,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: true,
    productPhrase: "TTF",
    contractNote:
      "NYMEX Dutch TTF Natural Gas Calendar Month futures (EUR/MWh). Curve marks are CME Group official settlements for one trade date — not ICE Endex TTF.",
    unavailableReason:
      "Futures curve data unavailable. Not enough verified NYMEX TTF calendar-month contracts were returned.",
  },
  {
    id: "gold",
    name: "Gold",
    root: "GC",
    venue: "CMX",
    cmeProductId: 437,
    exchangeLabel: "COMEX",
    currency: "USD",
    unit: "USD/oz",
    digits: 2,
    // COMEX lists consecutive monthly GC contracts (~24 months); active-month liquidity still concentrates in even months.
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Gold",
    contractNote:
      "COMEX gold futures, USD per troy ounce. Monthly listed contracts from CME settlements — not the spot price in the overview. Liquidity remains heaviest in Feb/Apr/Jun/Aug/Oct/Dec.",
    unavailableReason: "Futures curve data unavailable. Not enough verified COMEX gold months were returned.",
  },
  {
    id: "silver",
    name: "Silver",
    root: "SI",
    venue: "CMX",
    cmeProductId: 458,
    exchangeLabel: "COMEX",
    currency: "USD",
    unit: "USD/oz",
    digits: 2,
    // COMEX lists consecutive monthly SI contracts; legacy HKNUZ months remain the most liquid.
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Silver",
    contractNote:
      "COMEX silver futures, USD per troy ounce. Monthly listed contracts from CME settlements — not the spot price in the overview. Liquidity remains heaviest in Mar/May/Jul/Sep/Dec.",
    unavailableReason: "Futures curve data unavailable. Not enough verified COMEX silver months were returned.",
  },
  {
    id: "copper",
    name: "Copper",
    root: "HG",
    venue: "CMX",
    cmeProductId: 438,
    exchangeLabel: "COMEX",
    currency: "USD",
    unit: "USD/lb",
    digits: 4,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Copper",
    contractNote:
      "COMEX copper futures, USD per pound. CME settlements — not the LME cash settlement shown in the overview.",
    unavailableReason: "Futures curve data unavailable. Not enough verified COMEX copper months were returned.",
  },
  {
    id: "aluminium",
    name: "Aluminium",
    root: "ALI",
    venue: "CMX",
    cmeProductId: 7440,
    exchangeLabel: "COMEX",
    currency: "USD",
    unit: "USD/t",
    digits: 2,
    cycle: "monthly",
    horizon: 13,
    allowUnstatedMonth: false,
    productPhrase: "Aluminum",
    contractNote:
      "COMEX Aluminum (ALI) futures, USD per metric tonne. CME settlements — not the LME cash settlement shown in the overview. Far months without volume or open interest are omitted.",
    unavailableReason: "Futures curve data unavailable. Not enough verified COMEX aluminium months were returned.",
  },
  {
    id: "wheat",
    name: "Wheat",
    root: "ZW",
    venue: "CBT",
    cmeProductId: 323,
    exchangeLabel: "CBOT",
    currency: "USX",
    unit: "USc/bu",
    digits: 2,
    cycle: "grain",
    horizon: 12,
    allowUnstatedMonth: false,
    productPhrase: "Wheat",
    contractNote:
      "CBOT Chicago SRW wheat futures, US cents per bushel. Listed only Mar/May/Jul/Sep/Dec — blank calendar months are listing-cycle gaps, not missing data. CME settlements.",
    unavailableReason: "Futures curve data unavailable. Not enough verified CBOT wheat months were returned.",
  },
  {
    id: "corn",
    name: "Corn",
    root: "ZC",
    venue: "CBT",
    cmeProductId: 300,
    exchangeLabel: "CBOT",
    currency: "USX",
    unit: "USc/bu",
    digits: 2,
    cycle: "grain",
    horizon: 12,
    allowUnstatedMonth: false,
    productPhrase: "Corn",
    contractNote:
      "CBOT corn futures, US cents per bushel. Listed only Mar/May/Jul/Sep/Dec — blank calendar months are listing-cycle gaps, not missing data. CME settlements.",
    unavailableReason: "Futures curve data unavailable. Not enough verified CBOT corn months were returned.",
  },
];

export type ListedFutureQuote = {
  symbol: string;
  year: number;
  monthIndex: number;
  price: number;
  sessionDate: string;
  volume: number;
  lastTradeAt: string;
  currency: string;
  fullExchangeName: string;
  name: string;
  nameStatus: "match" | "no-month" | "conflict";
};

type QuoteHit = ListedFutureQuote;

function exchangeMonth(now: Date): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, monthIndex: month - 1 };
}

function exchangeCalendarDay(now: Date): { year: number; monthIndex: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    monthIndex: Number(parts.find((part) => part.type === "month")?.value) - 1,
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

/** CME Settlements API expects `MM/DD/YYYY`. */
function cmeTradeDateCandidates(now: Date): string[] {
  const today = exchangeCalendarDay(now);
  const out: string[] = [];
  for (let back = 0; back < CME_TRADE_DATE_LOOKBACK_DAYS; back++) {
    const d = new Date(Date.UTC(today.year, today.monthIndex, today.day - back));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${mm}/${dd}/${d.getUTCFullYear()}`);
  }
  return out;
}

function cmeTradeDateToIso(tradeDate: string): string | null {
  const match = tradeDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !day || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCmeMonthLabel(month: string): { year: number; monthIndex: number } | null {
  const match = month.trim().toUpperCase().match(/^([A-Z]{3})\s*'?(\d{2})$/);
  if (!match) return null;
  const monthIndex = MONTH_SHORT.findIndex((label) => label.toUpperCase() === match[1]);
  if (monthIndex < 0) return null;
  return { year: 2000 + Number(match[2]), monthIndex };
}

/** Decimal settles, or CBOT eighths like `578'2`. */
export function parseCmeSettle(raw: string): number {
  const text = raw.trim();
  if (text.includes("'")) {
    const [whole, eighths] = text.split("'");
    const base = Number(whole);
    const frac = Number(eighths);
    if (!Number.isFinite(base) || !Number.isFinite(frac)) return NaN;
    return base + frac / 8;
  }
  return Number(text.replace(/,/g, ""));
}

/**
 * Parse CME volume / open interest. Blank or "-" is unknown (null), not confirmed zero.
 * Only discard when both fields are explicitly present and both are zero.
 */
export function parseCmeActivity(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === "-" || text.toLowerCase() === "null") return null;
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function keepCmeSettlementRow(volume: number | null, openInterest: number | null): boolean {
  if (volume != null && volume > 0) return true;
  if (openInterest != null && openInterest > 0) return true;
  // Both unknown: keep a published settle rather than inventing zero activity.
  if (volume == null && openInterest == null) return true;
  // One unknown + the other explicitly zero: do not treat the unknown as zero.
  if (volume == null || openInterest == null) return true;
  // Both explicitly zero: indicative / non-tradable placeholder.
  return false;
}

/** Eligible delivery months for the CME strip: on-cycle and inside the 12M UI window (+ reach-through). */
function cmeStripEligible(
  year: number,
  monthIndex: number,
  cycle: Cycle,
  now: Date,
): boolean {
  const onCycle = cycleMonths(cycle);
  if (onCycle && !onCycle.has(monthIndex)) return false;
  const start = exchangeMonth(now);
  if (year < start.year || (year === start.year && monthIndex < start.monthIndex)) return false;
  return deliveryMonthStart(year, monthIndex) <= horizonEndUtc(CME_STRIP_HORIZON_MONTHS, now);
}

function candidateMonths(spec: CurveSpec, now: Date): Array<{ year: number; monthIndex: number }> {
  const start = exchangeMonth(now);
  const step = cycleStep(spec.cycle);
  const onCycle = cycleMonths(spec.cycle);
  let cursor = start;
  if (onCycle && !onCycle.has(cursor.monthIndex)) {
    cursor = step(cursor.year, cursor.monthIndex);
  }
  const months: Array<{ year: number; monthIndex: number }> = [];
  for (let i = 0; i < spec.horizon; i++) {
    months.push({ year: cursor.year, monthIndex: cursor.monthIndex });
    cursor = step(cursor.year, cursor.monthIndex);
  }
  return months;
}

function candidateSymbols(spec: CurveSpec, now: Date): string[] {
  return candidateMonths(spec, now).map((cursor) => {
    const code = MONTH_CODES[cursor.monthIndex];
    const year = String(cursor.year).slice(2);
    return `${spec.root}${code}${year}.${spec.venue}`;
  });
}

export async function fetchListedSession(symbol: string): Promise<ListedFutureQuote | null> {
  const parsed = parseContractSymbol(symbol);
  if (!parsed) return null;
  const { year, monthIndex } = parsed;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;

  async function once(): Promise<ListedFutureQuote | null> {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
          };
          meta?: {
            symbol?: string;
            instrumentType?: string;
            currency?: string;
            shortName?: string;
            longName?: string;
            fullExchangeName?: string;
            regularMarketTime?: number;
            regularMarketPrice?: number;
            regularMarketVolume?: number;
          };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!result || !meta || meta.symbol !== symbol || meta.instrumentType !== "FUTURE") return null;
    if (typeof meta.regularMarketTime !== "number") return null;

    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const volumes = result.indicators?.quote?.[0]?.volume ?? [];
    let barClose = NaN;
    let barVolume = 0;
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      const ts = timestamps[i];
      if (typeof close !== "number" || !(close > 0) || typeof ts !== "number") continue;
      barClose = close;
      const vol = volumes[i];
      barVolume = typeof vol === "number" && vol > 0 ? vol : 0;
    }

    const live = meta.regularMarketPrice;
    const price =
      typeof live === "number" && Number.isFinite(live) && live > 0
        ? live
        : Number.isFinite(barClose)
          ? barClose
          : NaN;
    if (!Number.isFinite(price) || !(price > 0)) return null;

    const liveVolume = meta.regularMarketVolume;
    const volume = typeof liveVolume === "number" && liveVolume > 0 ? liveVolume : barVolume;

    const sessionDate = new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10);
    const name = meta.longName?.trim() || meta.shortName?.trim() || "";
    return {
      symbol,
      year,
      monthIndex,
      price,
      sessionDate,
      volume,
      lastTradeAt: new Date(meta.regularMarketTime * 1000).toISOString(),
      currency: meta.currency ?? "",
      fullExchangeName: meta.fullExchangeName?.trim() || "",
      name,
      nameStatus: deliveryNameStatus(name, monthIndex, year),
    };
  }

  try {
    const first = await once();
    if (first) return first;
  } catch {
    // retry once below
  }
  try {
    return await once();
  } catch {
    return null;
  }
}

async function fetchCmeSettlementsForDate(
  productId: number,
  tradeDate: string,
): Promise<{ tradeDate: string; rows: SettlementHit[] } | null> {
  if (cmeCircuitOpen()) return null;
  /** Local DO simulation: treat CmeWS as unreachable (fail-fast + trip circuit). */
  if (process.env.FUTURES_CME_BLOCK === "1") {
    tripCmeCircuit();
    return null;
  }
  /** Simulate a hung CmeWS host: wait one timeout budget, then trip the shared circuit. */
  if (process.env.FUTURES_CME_BLOCK === "timeout") {
    await new Promise((r) => setTimeout(r, CME_FETCH_TIMEOUT_MS));
    tripCmeCircuit();
    return null;
  }
  const sessionDate = cmeTradeDateToIso(tradeDate);
  if (!sessionDate) return null;
  const url = `https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/${productId}/FUT?tradeDate=${encodeURIComponent(tradeDate)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": CME_UA,
        Accept: "application/json",
        Referer: "https://www.cmegroup.com/",
      },
      signal: AbortSignal.timeout(CME_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Hard block / gateway errors: fail the whole CmeWS path quickly.
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        tripCmeCircuit();
      }
      return null;
    }
    const json = (await res.json()) as {
      settlements?: Array<{ month?: string; settle?: string; volume?: string; openInterest?: string }>;
      tradeDate?: string;
    };
    clearCmeCircuit();
    const rows: SettlementHit[] = [];
    for (const row of json.settlements ?? []) {
      if (!row.month || row.month === "Total" || !row.settle || row.settle === "-") continue;
      const parsed = parseCmeMonthLabel(row.month);
      if (!parsed) continue;
      const price = parseCmeSettle(row.settle);
      if (!Number.isFinite(price) || !(price > 0)) continue;
      const volume = parseCmeActivity(row.volume);
      const openInterest = parseCmeActivity(row.openInterest);
      if (!keepCmeSettlementRow(volume, openInterest)) continue;
      rows.push({
        year: parsed.year,
        monthIndex: parsed.monthIndex,
        price,
        volume: volume ?? 0,
        openInterest: openInterest ?? 0,
        sessionDate,
      });
    }
    if (rows.length === 0) return null;
    return { tradeDate: json.tradeDate ?? tradeDate, rows };
  } catch (err) {
    if (isCmeTransportFailure(err)) tripCmeCircuit();
    throw err;
  }
}

async function fetchCmeSettlements(
  productId: number,
  now: Date,
  budgetDeadlineMs?: number,
): Promise<{ tradeDate: string; sessionDate: string; rows: SettlementHit[] } | null> {
  if (cmeCircuitOpen()) return null;
  if (budgetDeadlineMs != null && Date.now() >= budgetDeadlineMs) return null;
  const todayIso = (() => {
    const today = exchangeCalendarDay(now);
    return `${today.year}-${String(today.monthIndex + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  })();
  for (const tradeDate of cmeTradeDateCandidates(now)) {
    if (cmeCircuitOpen()) return null;
    if (budgetDeadlineMs != null && Date.now() >= budgetDeadlineMs) return null;
    try {
      const hit = await fetchCmeSettlementsForDate(productId, tradeDate);
      if (!hit) continue;
      const sessionDate = cmeTradeDateToIso(hit.tradeDate);
      if (!sessionDate) continue;
      const age = calendarDaysBetween(sessionDate, todayIso);
      if (age == null || age < 0 || age > MAX_CME_SETTLEMENT_AGE_DAYS) continue;
      return { tradeDate: hit.tradeDate, sessionDate, rows: hit.rows };
    } catch {
      // Transport failures trip the circuit inside fetchCmeSettlementsForDate.
      if (cmeCircuitOpen()) return null;
    }
  }
  return null;
}

function emptyCurve(spec: CurveSpec, reason: string): FuturesCurve {
  return {
    id: spec.id,
    name: spec.name,
    enabled: false,
    exchange: null,
    currency: null,
    unit: null,
    digits: spec.digits,
    sourceLabel: null,
    quotedFrom: null,
    quotedTo: null,
    sessionDate: null,
    sessionNote: null,
    spreadCaution: null,
    contractNote: spec.contractNote,
    points: [],
    shape: null,
    spreadM1M2: null,
    spreadM1M2Label: null,
    spreadM1M6: null,
    spreadM1M6Label: null,
    unavailableReason: reason,
    history: emptyHistoricalCurves(reason),
  };
}

function isoToMdY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

function weekdayUtc(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function isWeekendIso(iso: string): boolean {
  const day = weekdayUtc(iso);
  return day === 0 || day === 6;
}

/** Walk back `sessions` weekdays from fromIso (exclusive of fromIso). */
function priorWeekdayIso(fromIso: string, sessions: number): string {
  let cursor = fromIso;
  let found = 0;
  let guard = 0;
  while (found < sessions && guard < sessions + 40) {
    cursor = addDaysIso(cursor, -1);
    if (!isWeekendIso(cursor)) found += 1;
    guard += 1;
  }
  return cursor;
}

function oneMonthEarlierIso(fromIso: string): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 - 1, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d!, lastDay));
  return dt.toISOString().slice(0, 10);
}

function cmeWindowIncludes(latestIso: string, targetIso: string): boolean {
  const age = calendarDaysBetween(targetIso, latestIso);
  return age != null && age >= 0 && age <= CME_HISTORY_MAX_CALENDAR_DAYS;
}

function historicalFromPriced(
  horizon: HistoryCurveHorizon,
  sessionDate: string | null,
  source: HistoricalCurve["source"],
  months: Array<{ year: number; monthIndex: number }>,
  priceByKey: Map<string, number>,
  unavailableReason: string | null = null,
): HistoricalCurve {
  const points = months.map((month) => {
    const key = `${month.year}-${month.monthIndex}`;
    const price = priceByKey.get(key);
    return {
      year: month.year,
      monthIndex: month.monthIndex,
      price: price != null && price > 0 ? price : null,
    };
  });
  const priced = points.filter((point) => point.price != null);
  const near = priced[0];
  const second = priced[1];
  const sixth = priced[5];
  if (priced.length < 2) {
    return {
      horizon,
      sessionDate,
      source,
      points,
      shape: null,
      spreadM1M2: null,
      spreadM1M2Label: null,
      spreadM1M6: null,
      spreadM1M6Label: null,
      unavailableReason: unavailableReason ?? "Not enough matched delivery months for a historical curve.",
    };
  }
  return {
    horizon,
    sessionDate,
    source,
    points,
    shape: classifyFuturesCurve(priced.map((point) => point.price!)),
    spreadM1M2: near?.price != null && second?.price != null ? calendarSpread(near.price, second.price) : null,
    spreadM1M2Label:
      near && second
        ? `${contractLabel(near.monthIndex, near.year)} − ${contractLabel(second.monthIndex, second.year)}`
        : null,
    spreadM1M6: near?.price != null && sixth?.price != null ? calendarSpread(near.price, sixth.price) : null,
    spreadM1M6Label:
      near && sixth
        ? `${contractLabel(near.monthIndex, near.year)} − ${contractLabel(sixth.monthIndex, sixth.year)}`
        : null,
    unavailableReason: null,
  };
}

/**
 * Candidates nearest to `targetApprox`, preferring the exact day then ±1…±N
 * (so a 1w target that falls just outside the CmeWS retention window can still
 * resolve to the closest official settlement session, e.g. Tue→Wed).
 */
function historicalSessionCandidates(targetApprox: string, latestIso: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (iso: string) => {
    if (seen.has(iso)) return;
    if (iso >= latestIso) return;
    if (isWeekendIso(iso)) return;
    seen.add(iso);
    out.push(iso);
  };
  push(targetApprox);
  for (let delta = 1; delta <= HOLIDAY_WALK_EXTRA_DAYS; delta++) {
    push(addDaysIso(targetApprox, delta));
    push(addDaysIso(targetApprox, -delta));
  }
  return out;
}

async function resolveHistoricalSession(
  spec: CurveSpec,
  latestIso: string,
  targetApprox: string,
): Promise<{ sessionDate: string; source: "cme" | "snapshot"; rows: SnapshotRow[] } | null> {
  const candidates = historicalSessionCandidates(targetApprox, latestIso);

  for (const candidate of candidates) {
    if (!cmeWindowIncludes(latestIso, candidate)) continue;
    try {
      const hit = await fetchCmeSettlementsForDate(spec.cmeProductId, isoToMdY(candidate));
      if (hit && hit.rows.length > 0) {
        const sessionDate = cmeTradeDateToIso(hit.tradeDate) ?? candidate;
        const rows: SnapshotRow[] = hit.rows.map((row) => ({
          year: row.year,
          monthIndex: row.monthIndex,
          price: row.price,
          volume: row.volume,
          openInterest: row.openInterest,
        }));
        return { sessionDate, source: "cme", rows };
      }
    } catch {
      // try next candidate / snapshot
    }
  }

  for (const candidate of candidates) {
    const snap = await findCurveSnapshotOnOrBefore(spec.id, candidate, HOLIDAY_WALK_EXTRA_DAYS);
    if (snap && snap.sessionDate < latestIso) {
      return { sessionDate: snap.sessionDate, source: "snapshot", rows: snap.rows };
    }
  }
  return null;
}

async function yahooCloseOnDate(symbol: string, sessionDate: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          meta?: { symbol?: string; instrumentType?: string };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!result || !meta || meta.symbol !== symbol || meta.instrumentType !== "FUTURE") return null;
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      const ts = timestamps[i];
      if (typeof close !== "number" || !(close > 0) || typeof ts !== "number") continue;
      if (new Date(ts * 1000).toISOString().slice(0, 10) === sessionDate) return close;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadYahooHistoricalAligned(
  spec: CurveSpec,
  months: Array<{ year: number; monthIndex: number }>,
  sessionDate: string,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const symbols = months.map((month) => ({
    key: `${month.year}-${month.monthIndex}`,
    symbol: `${spec.root}${MONTH_CODES[month.monthIndex]}${String(month.year).slice(2)}.${spec.venue}`,
  }));
  const closes = await mapLimited(symbols, 3, async (item) => {
    const close = await yahooCloseOnDate(item.symbol, sessionDate);
    return { key: item.key, close };
  });
  for (const row of closes) {
    if (row.close != null) prices.set(row.key, row.close);
  }
  return prices;
}

async function attachHistory(spec: CurveSpec, curve: FuturesCurve): Promise<FuturesCurve> {
  if (!curve.enabled || !curve.sessionDate) {
    return { ...curve, history: emptyHistoricalCurves(curve.unavailableReason) };
  }

  const latestIso = curve.sessionDate;
  const todayMonths = curve.points
    .filter((point) => !point.gap && point.price != null)
    .map((point) => ({ year: point.year, monthIndex: point.monthIndex }));

  const todayPrices = new Map<string, number>();
  for (const point of curve.points) {
    if (point.gap || point.price == null) continue;
    todayPrices.set(`${point.year}-${point.monthIndex}`, point.price);
  }

  const todayEntry = historicalFromPriced(
    "today",
    latestIso,
    isOfficialCmeSettlementSource(curve.sourceLabel) ? "cme" : "yahoo",
    todayMonths,
    todayPrices,
  );

  const targets: Array<{ horizon: HistoryCurveHorizon; approx: string }> = [
    { horizon: "1d", approx: priorWeekdayIso(latestIso, 1) },
    { horizon: "1w", approx: priorWeekdayIso(latestIso, 5) },
    { horizon: "1m", approx: priorWeekdayIso(latestIso, 21) },
  ];

  // 1M fallback: calendar month earlier when weekday walk fails later
  const monthFallback = oneMonthEarlierIso(latestIso);

  const historyEntries: HistoricalCurve[] = [todayEntry];

  for (const target of targets) {
    let resolved = await resolveHistoricalSession(spec, latestIso, target.approx);
    if (!resolved && target.horizon === "1m") {
      resolved = await resolveHistoricalSession(spec, latestIso, monthFallback);
    }

    if (resolved) {
      const priceByKey = new Map<string, number>();
      for (const row of resolved.rows) {
        priceByKey.set(`${row.year}-${row.monthIndex}`, row.price);
      }
      // Persist official history strips so later 1w/1m overlays can use snapshots
      // after CmeWS drops the tradeDate from its short retention window.
      if (resolved.source === "cme") {
        await saveSettlementSnapshot(spec.id, resolved.sessionDate, resolved.rows);
      }
      historyEntries.push(
        historicalFromPriced(target.horizon, resolved.sessionDate, resolved.source, todayMonths, priceByKey),
      );
      continue;
    }

    // Yahoo per-contract: use the approximated weekday session (walk for holidays via closes present)
    let yahooSession: string | null = null;
    let yahooPrices = new Map<string, number>();
    for (let back = 0; back <= HOLIDAY_WALK_EXTRA_DAYS; back++) {
      const candidate = addDaysIso(target.approx, -back);
      if (candidate >= latestIso || isWeekendIso(candidate)) continue;
      const prices = await loadYahooHistoricalAligned(spec, todayMonths, candidate);
      if (prices.size >= 2) {
        yahooSession = candidate;
        yahooPrices = prices;
        break;
      }
    }
    if (target.horizon === "1m" && yahooPrices.size < 2) {
      for (let back = 0; back <= HOLIDAY_WALK_EXTRA_DAYS; back++) {
        const candidate = addDaysIso(monthFallback, -back);
        if (candidate >= latestIso || isWeekendIso(candidate)) continue;
        const prices = await loadYahooHistoricalAligned(spec, todayMonths, candidate);
        if (prices.size >= 2) {
          yahooSession = candidate;
          yahooPrices = prices;
          break;
        }
      }
    }

    if (yahooSession && yahooPrices.size >= 2) {
      historyEntries.push(historicalFromPriced(target.horizon, yahooSession, "yahoo", todayMonths, yahooPrices));
    } else {
      historyEntries.push({
        horizon: target.horizon,
        sessionDate: null,
        source: null,
        points: todayMonths.map((month) => ({ ...month, price: null })),
        shape: null,
        spreadM1M2: null,
        spreadM1M2Label: null,
        spreadM1M6: null,
        spreadM1M6Label: null,
        unavailableReason: `No CME settlement, snapshot, or Yahoo closes for ~${target.approx}.`,
      });
    }
  }

  // Ensure order today, 1d, 1w, 1m
  const byHorizon = new Map(historyEntries.map((entry) => [entry.horizon, entry]));
  const history = HISTORY_CURVE_HORIZONS.map(
    (horizon) =>
      byHorizon.get(horizon) ?? {
        horizon,
        sessionDate: null,
        source: null,
        points: [],
        shape: null,
        spreadM1M2: null,
        spreadM1M2Label: null,
        spreadM1M6: null,
        spreadM1M6Label: null,
        unavailableReason: "Historical curve unavailable.",
      },
  );

  return { ...curve, history };
}

function finalizePoints(
  spec: CurveSpec,
  points: FuturesContractPoint[],
  opts: {
    sessionDate: string;
    sourceLabel: string;
    exchange: string;
    sessionNote: string | null;
    spreadCaution: string | null;
  },
): FuturesCurve {
  const priced = points.filter((point) => point.price != null);
  if (priced.length < 2) return emptyCurve(spec, spec.unavailableReason);
  const near = priced[0]!;
  const second = priced[1]!;
  const sixth = priced[5];
  const times = points.map((point) => Date.parse(point.quotedAt)).filter((time) => Number.isFinite(time));
  const hasGap = points.some((point) => point.gap);
  return {
    id: spec.id,
    name: spec.name,
    enabled: true,
    exchange: opts.exchange,
    currency: spec.currency === "USX" ? "USc" : spec.currency,
    unit: spec.unit,
    digits: spec.digits,
    sourceLabel: opts.sourceLabel,
    quotedFrom: times.length ? new Date(Math.min(...times)).toISOString() : null,
    quotedTo: times.length ? new Date(Math.max(...times)).toISOString() : null,
    sessionDate: opts.sessionDate,
    sessionNote: [
      opts.sessionNote,
      hasGap
        ? isOfficialCmeSettlementSource(opts.sourceLabel)
          ? "A blank month had no verified mark on this trade date. Later months that did settle stay on the curve, and the line does not cross the blank."
          : "A blank month had no trade on this session. Later months that did trade stay on the curve, and the line does not cross the blank."
        : null,
    ]
      .filter(Boolean)
      .join(" ") || null,
    spreadCaution: opts.spreadCaution,
    contractNote: spec.contractNote,
    points,
    shape: classifyFuturesCurve(priced.map((point) => point.price!)),
    spreadM1M2: calendarSpread(near.price!, second.price!),
    spreadM1M2Label: `${near.label} − ${second.label}`,
    spreadM1M6: sixth?.price != null ? calendarSpread(near.price!, sixth.price) : null,
    spreadM1M6Label: sixth ? `${near.label} − ${sixth.label}` : null,
    unavailableReason: null,
    history: emptyHistoricalCurves(),
  };
}

type SettlementAssembleOpts = {
  sourceLabel: "CME settlements" | "CME Daily Bulletin";
  sessionNote: string;
};

/** Exported for audit / unit tests — production path is loadFuturesTermStructure. */
export function assembleCme(
  spec: CurveSpec,
  payload: { sessionDate: string; rows: SettlementHit[] },
  now: Date,
  assembleOpts: SettlementAssembleOpts = {
    sourceLabel: "CME settlements",
    sessionNote: `Official CME Group settlement prices for trade date ${payload.sessionDate}.`,
  },
): FuturesCurve {
  // Deduplicate by delivery month (first row wins; CME usually sends one settle per month).
  const byMonth = new Map<string, SettlementHit>();
  for (const row of payload.rows) {
    // Drop post-LTD months (critical for Daily Bulletin where vol/OI are unavailable).
    if (!isFuturesContractActiveOnSession(spec.id, row.year, row.monthIndex, payload.sessionDate)) {
      continue;
    }
    if (!cmeStripEligible(row.year, row.monthIndex, spec.cycle, now)) continue;
    const key = `${row.year}-${row.monthIndex}`;
    if (!byMonth.has(key)) byMonth.set(key, { ...row, sessionDate: payload.sessionDate });
  }
  const filtered = [...byMonth.values()].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  // Cap is a safety bound for the 12M strip (+ reach-through) — not a Yahoo probe leftover.
  const tradable = dropThinCurrentMonthFront(filtered, exchangeMonth(now)).slice(0, MAX_CURVE_POINTS);
  const slots = buildListedSlots(tradable, cycleStep(spec.cycle));
  const contracts = slots.flatMap((slot) => (slot.kind === "contract" ? [slot.point] : []));
  if (contracts.length < 2) return emptyCurve(spec, spec.unavailableReason);

  const currentMonth = exchangeMonth(now);
  const quotedAt = `${payload.sessionDate}T21:00:00.000Z`;
  const points: FuturesContractPoint[] = slots.map((slot) => {
    if (slot.kind === "gap") {
      return {
        symbol: "",
        label: contractLabel(slot.monthIndex, slot.year),
        axisLabel: contractAxisLabel(slot.monthIndex, slot.year),
        year: slot.year,
        monthIndex: slot.monthIndex,
        price: null,
        gap: true,
        sessionDate: payload.sessionDate,
        quotedAt: "",
        volume: 0,
        earlierQuote: false,
        expiring: false,
      };
    }
    const hit = slot.point;
    return {
      symbol: `${spec.root}${MONTH_CODES[hit.monthIndex]}${String(hit.year).slice(2)}.${spec.venue}`,
      label: contractLabel(hit.monthIndex, hit.year),
      axisLabel: contractAxisLabel(hit.monthIndex, hit.year),
      year: hit.year,
      monthIndex: hit.monthIndex,
      price: hit.price,
      gap: false,
      sessionDate: hit.sessionDate,
      quotedAt,
      volume: hit.volume,
      earlierQuote: false,
      expiring: hit.year === currentMonth.year && hit.monthIndex === currentMonth.monthIndex,
    };
  });

  return finalizePoints(spec, points, {
    sessionDate: payload.sessionDate,
    sourceLabel: assembleOpts.sourceLabel,
    exchange: spec.exchangeLabel,
    sessionNote: assembleOpts.sessionNote,
    spreadCaution: null,
  });
}

function assembleYahoo(spec: CurveSpec, hits: Array<QuoteHit | null>, now: Date): FuturesCurve {
  const quotes = hits.filter((hit): hit is QuoteHit => hit != null);
  const sameProduct = quotes.filter((hit) => {
    if (hit.currency !== spec.currency) return false;
    if (!hit.name.includes(spec.productPhrase)) return false;
    if (hit.nameStatus === "conflict") return false;
    if (hit.nameStatus === "no-month") return spec.allowUnstatedMonth;
    return hit.volume > 0;
  });
  if (sameProduct.length === 0) return emptyCurve(spec, spec.unavailableReason);

  const ordered = [...sameProduct].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  const sessionDates = [...new Set(ordered.map((hit) => hit.sessionDate))].sort();
  const sessionDate = sessionDates[sessionDates.length - 1] ?? "";
  const sessionEligible = ordered.filter((hit) => {
    if (!sessionDate) return false;
    const lag = calendarDaysBetween(hit.sessionDate, sessionDate);
    return lag != null && lag >= 0 && lag <= MAX_SESSION_LOOKBACK_DAYS;
  });
  const newestEligibleTrade = Math.max(
    ...sessionEligible.map((hit) => Date.parse(hit.lastTradeAt)).filter((t) => Number.isFinite(t)),
    0,
  );
  const onSession = sessionEligible.filter((hit) => {
    const traded = Date.parse(hit.lastTradeAt);
    return Number.isFinite(traded) && newestEligibleTrade - traded <= MAX_QUOTE_AGE_VS_NEWEST_MS;
  });
  const keptSessionDates = [...new Set(onSession.map((hit) => hit.sessionDate))].sort();
  const tradable = dropThinCurrentMonthFront(onSession, exchangeMonth(now));
  const slots = buildListedSlots(tradable, cycleStep(spec.cycle));
  const contracts = slots.flatMap((slot) => (slot.kind === "contract" ? [slot.point] : []));
  if (contracts.length < 2) return emptyCurve(spec, spec.unavailableReason);

  const exchanges = new Set(contracts.map((hit) => hit.fullExchangeName).filter(Boolean));
  if (exchanges.size > 1) {
    return emptyCurve(spec, "Futures curve data unavailable. The contracts were not from one exchange.");
  }
  const newestTrade = Math.max(...contracts.map((hit) => Date.parse(hit.lastTradeAt)));
  const currentMonth = exchangeMonth(now);
  const points: FuturesContractPoint[] = slots.map((slot) => {
    if (slot.kind === "gap") {
      return {
        symbol: "",
        label: contractLabel(slot.monthIndex, slot.year),
        axisLabel: contractAxisLabel(slot.monthIndex, slot.year),
        year: slot.year,
        monthIndex: slot.monthIndex,
        price: null,
        gap: true,
        sessionDate,
        quotedAt: "",
        volume: 0,
        earlierQuote: false,
        expiring: false,
      };
    }
    const hit = slot.point;
    return {
      symbol: hit.symbol,
      label: contractLabel(hit.monthIndex, hit.year),
      axisLabel: contractAxisLabel(hit.monthIndex, hit.year),
      year: hit.year,
      monthIndex: hit.monthIndex,
      price: hit.price,
      gap: false,
      sessionDate: hit.sessionDate,
      quotedAt: hit.lastTradeAt,
      volume: hit.volume,
      earlierQuote: Number.isFinite(newestTrade) && newestTrade - Date.parse(hit.lastTradeAt) > EARLIER_QUOTE_MS,
      expiring: hit.year === currentMonth.year && hit.monthIndex === currentMonth.monthIndex,
    };
  });
  const priced = points.filter((point) => point.price != null);
  const earlier = points.some((point) => point.earlierQuote);
  const spreadLegs = [priced[0], priced[1], priced[5]].filter(
    (point): point is FuturesContractPoint => point != null,
  );

  return finalizePoints(spec, points, {
    sessionDate,
    sourceLabel: "Yahoo (fallback)",
    exchange: exchanges.values().next().value ?? spec.exchangeLabel,
    sessionNote: [
      "CME settlements were unavailable; this strip uses same-session Yahoo last trades only.",
      earlier
        ? "Some months last traded more than two hours before the newest trade. Those prices are earlier trades, not a simultaneous snapshot."
        : null,
      keptSessionDates.length > 1
        ? `Not a simultaneous strip: contract marks span ${keptSessionDates[0]} → ${keptSessionDates[keptSessionDates.length - 1]}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    spreadCaution: spreadLegs.some((point) => point.earlierQuote)
      ? "One leg last traded earlier in this session."
      : null,
  });
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function loadYahooCurve(spec: CurveSpec, now: Date): Promise<FuturesCurve> {
  const symbols = candidateSymbols(spec, now);
  const hits = await mapLimited(symbols, 8, async (symbol) => {
    try {
      return await fetchListedSession(symbol);
    } catch {
      return null;
    }
  });
  return assembleYahoo(spec, hits, now);
}

async function saveSettlementSnapshot(
  curveId: string,
  sessionDate: string,
  rows: Array<{ year: number; monthIndex: number; price: number; volume: number; openInterest: number }>,
): Promise<void> {
  await saveCurveSnapshot(
    curveId,
    sessionDate,
    rows.map((row) => ({
      year: row.year,
      monthIndex: row.monthIndex,
      price: row.price,
      volume: row.volume,
      openInterest: row.openInterest,
    })),
  );
}

/**
 * Waterfall per curve:
 * 1) CmeWS Settlements JSON (unchanged primary)
 * 2) CME Daily Bulletin PDF (official settlement fallback — no Yahoo mix)
 * 3) Yahoo last-trades only if both settlement sources fail (explicitly labeled)
 */
export async function loadFuturesTermStructure(now = new Date()): Promise<FuturesTermStructure> {
  try {
    /** Local verification only: skip CmeWS so Daily Bulletin path is exercised on :8080. */
    const forceDailyBulletin = process.env.FUTURES_FORCE_DAILY_BULLETIN === "1";
    const liveBudgetDeadline = Date.now() + CME_LIVE_BUDGET_MS;

    const cmePayloads = await mapLimited(CURVES, 4, async (spec) => {
      if (forceDailyBulletin || cmeCircuitOpen()) return { spec, payload: null };
      try {
        return {
          spec,
          payload: await fetchCmeSettlements(spec.cmeProductId, now, liveBudgetDeadline),
        };
      } catch {
        return { spec, payload: null };
      }
    });

    const liveCurves = await mapLimited(cmePayloads, 3, async ({ spec, payload }) => {
      if (payload) {
        const curve = assembleCme(spec, payload, now);
        if (curve.enabled) {
          await saveSettlementSnapshot(spec.id, payload.sessionDate, payload.rows);
          return curve;
        }
      }

      // Official settlement fallback — Daily Bulletin (do not mix with Yahoo lasts).
      try {
        const bulletin = await fetchDailyBulletinSettlements(spec.id);
        if (bulletin) {
          const ageOk = (() => {
            const today = exchangeCalendarDay(now);
            const todayIso = `${today.year}-${String(today.monthIndex + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
            const age = calendarDaysBetween(bulletin.sessionDate, todayIso);
            return age != null && age >= 0 && age <= MAX_CME_SETTLEMENT_AGE_DAYS;
          })();
          if (ageOk) {
            const settlementRows: SettlementHit[] = bulletin.rows.map((row) => ({
              year: row.year,
              monthIndex: row.monthIndex,
              price: row.price,
              volume: row.volume,
              openInterest: row.openInterest,
              sessionDate: bulletin.sessionDate,
            }));
            const curve = assembleCme(
              spec,
              { sessionDate: bulletin.sessionDate, rows: settlementRows },
              now,
              {
                sourceLabel: "CME Daily Bulletin",
                sessionNote: `Official CME Group Daily Bulletin settlement prices for trade date ${bulletin.sessionDate}. CmeWS settlements were unavailable.`,
              },
            );
            if (curve.enabled) {
              await saveSettlementSnapshot(spec.id, bulletin.sessionDate, settlementRows);
              return curve;
            }
          }
        }
      } catch {
        // fall through to Yahoo
      }

      try {
        return await loadYahooCurve(spec, now);
      } catch {
        return emptyCurve(spec, spec.unavailableReason);
      }
    });

    const curves = await mapLimited(
      liveCurves.map((curve, index) => ({ curve, spec: CURVES[index]! })),
      2,
      async ({ curve, spec }) => attachHistory(spec, curve),
    );

    return {
      curves,
      fetchedAt: new Date().toISOString(),
      fromStaleCache: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The futures request failed.";
    return {
      curves: CURVES.map((spec) => emptyCurve(spec, `Futures curve data unavailable. ${message}`)),
      fetchedAt: new Date().toISOString(),
      fromStaleCache: false,
    };
  }
}
