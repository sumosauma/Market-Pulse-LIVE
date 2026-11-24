import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fetchTimeseries, pointsFromTimeseries } from "@/lib/fx/frankfurter";
import { contractLabel, MONTH_CODES } from "./futuresCurve";
import {
  futuresCurveSpecById,
  loadFuturesTermStructure,
  type FuturesCurveSpec,
} from "./futuresCurve.server";
import type { CurveSessionSnapshot, SnapshotRow } from "./futuresCurveSnapshots";
import { HISTORY_STALE_DAYS, type HistoryIndicator } from "./indicators";
import { loadCommodityIndicators } from "./indicators.server";
import { calendarDaysBetween } from "./overview";
import {
  applyLifecycle,
  mergeLifecycleState,
  rankAndTrim,
  runSignalEngine,
  type ForwardRepricingInput,
  type FxSeriesInput,
  type LifecycleState,
  type SignalCommodityInput,
} from "./signals.engine";
import {
  SIGNAL_THRESHOLDS,
  emptySignalsPayload,
  type CommoditySignalsPayload,
  type SignalStatus,
} from "./signals";

const STATE_PATH = "data/cache/commodities-signals-state.json";
const SNAPSHOTS_PATH = "data/cache/futures-curve-snapshots.json";
const CURVE_CACHE_PATH = "data/cache/commodities-futures-curve.json";
const STATE_VERSION = 2;
const YAHOO_FETCH_TIMEOUT_MS = 12_000;
const YAHOO_CONCURRENCY = 4;

const FORWARD_CURVE_IDS = [
  "brent",
  "wti",
  "henry-hub",
  "ttf",
  "gold",
  "silver",
  "copper",
  "aluminium",
  "wheat",
  "corn",
] as const;

const FX_CURRENCY: Record<string, "USD" | "EUR" | null> = {
  brent: "USD",
  wti: "USD",
  ttf: "EUR",
  "henry-hub": "USD",
  "nordic-power": "EUR",
  gold: "USD",
  silver: "USD",
  copper: "USD",
  aluminium: "USD",
  nickel: "USD",
  wheat: "USD",
  corn: "USD",
};

const CURVE_DISPLAY_NAMES: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  ttf: "TTF",
  "henry-hub": "Natural Gas",
  gold: "Gold",
  silver: "Silver",
  copper: "Copper",
  aluminium: "Aluminium",
  nickel: "Nickel",
  wheat: "Wheat",
  corn: "Corn",
};

function readLifecycleState(): LifecycleState | null {
  try {
    if (!existsSync(STATE_PATH)) return null;
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf8")) as LifecycleState;
    if (raw?.version !== STATE_VERSION || !raw.entries || typeof raw.entries !== "object") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeLifecycleState(state: LifecycleState): void {
  try {
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch {
    // Lifecycle persistence is best-effort.
  }
}

/** Prefer unit-implied quote currency; Nordic Power is EUR-denominated for FX display. */
function fxCurrencyForRow(row: HistoryIndicator): "USD" | "EUR" | null {
  if (row.id === "nordic-power") return "EUR";
  if (row.rvKind === "abs_change") return null;
  if (row.unit.startsWith("EUR")) return "EUR";
  if (row.unit.startsWith("USD")) return "USD";
  return FX_CURRENCY[row.id] ?? null;
}

function toSignalCommodity(row: HistoryIndicator): SignalCommodityInput {
  const last = row.bars[row.bars.length - 1]?.date ?? null;
  const age = last ? calendarDaysBetween(last, new Date().toISOString().slice(0, 10)) : null;
  const stale = row.stale || age == null || age > HISTORY_STALE_DAYS;
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    fxCurrency: fxCurrencyForRow(row),
    rvKind: row.rvKind,
    stale,
    bars: row.bars.map((b) => ({ date: b.date, close: b.close })),
  };
}

async function loadFxHistory(): Promise<FxSeriesInput> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 2);
  const start = startDate.toISOString().slice(0, 10);
  try {
    const [usd, eur] = await Promise.all([
      fetchTimeseries(start, end, "USD", ["SEK"]),
      fetchTimeseries(start, end, "EUR", ["SEK"]),
    ]);
    const usdsek = pointsFromTimeseries(usd, "SEK").map((p) => ({ date: p.date, close: p.close }));
    const eursek = pointsFromTimeseries(eur, "SEK").map((p) => ({ date: p.date, close: p.close }));
    if (
      usdsek.length < SIGNAL_THRESHOLDS.fxMinObservations ||
      eursek.length < SIGNAL_THRESHOLDS.fxMinObservations
    ) {
      return { usdsek, eursek, available: false };
    }
    return { usdsek, eursek, available: true };
  } catch {
    return { usdsek: [], eursek: [], available: false };
  }
}

function addMonths(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const absolute = year * 12 + monthIndex + delta;
  return { year: Math.floor(absolute / 12), monthIndex: ((absolute % 12) + 12) % 12 };
}

function monthsBetween(
  a: { year: number; monthIndex: number },
  b: { year: number; monthIndex: number },
): number {
  return Math.abs(a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));
}

function parseIso(iso: string): Date | null {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

function daysBetweenIso(a: string, b: string): number | null {
  const da = parseIso(a);
  const db = parseIso(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function pricedRows(session: CurveSessionSnapshot): SnapshotRow[] {
  return session.rows.filter((row) => Number.isFinite(row.price) && row.price > 0);
}

type DeliveryPick = { year: number; monthIndex: number; price: number };

/**
 * Nearest listed delivery to six calendar months ahead (not “6th contract”).
 * Rejects when closest listed month is farther than the configured max distance.
 */
function selectSixMonthTarget(
  rows: readonly DeliveryPick[],
  asOfIso: string,
): DeliveryPick | null {
  const asOf = parseIso(asOfIso);
  if (!asOf) return null;
  const target = addMonths(asOf.getUTCFullYear(), asOf.getUTCMonth(), SIGNAL_THRESHOLDS.futuresRepricingTargetMonths);
  let best: DeliveryPick | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const dist = monthsBetween({ year: row.year, monthIndex: row.monthIndex }, target);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  if (!best || bestDist > SIGNAL_THRESHOLDS.futuresRepricingMaxTargetDistanceMonths) return null;
  return best;
}

function selectFrontMonth(rows: readonly DeliveryPick[]): DeliveryPick | null {
  const sorted = [...rows].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex,
  );
  return sorted[0] ?? null;
}

function findSameContract(
  rows: readonly SnapshotRow[],
  year: number,
  monthIndex: number,
): SnapshotRow | null {
  return rows.find((row) => row.year === year && row.monthIndex === monthIndex) ?? null;
}

function sameContractReturn(
  current: DeliveryPick,
  prior: DeliveryPick,
): number | null {
  if (!(current.price > 0) || !(prior.price > 0)) return null;
  return current.price / prior.price - 1;
}

type SnapshotFile = {
  version: number;
  curves: Record<string, CurveSessionSnapshot[]>;
};

type CurveIdentityPoint = {
  year: number;
  monthIndex: number;
  price: number | null;
  gap: boolean;
  symbol?: string;
};

type CurveIdentity = {
  id: string;
  name: string;
  sessionDate: string | null;
  enabled: boolean;
  points: CurveIdentityPoint[];
  root: string;
  venue: string;
  currency: string;
};

type YahooBar = { date: string; close: number; volume: number | null };

type YahooSeries = {
  bars: YahooBar[];
  currency: string | null;
  instrumentType: string | null;
  metaSymbol: string | null;
};

/** CME Group trade-date calendar (America/Chicago). */
function exchangeTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function symbolFor(root: string, venue: string, year: number, monthIndex: number): string {
  return `${root}${MONTH_CODES[monthIndex]}${String(year).slice(2)}.${venue}`;
}

function pickPriorSessionDate(
  sessionDates: readonly string[],
  asOf: string,
): string | null {
  let prior: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const date of sessionDates) {
    if (date >= asOf) continue;
    const lag = daysBetweenIso(date, asOf);
    if (lag == null) continue;
    const dist = Math.abs(lag - SIGNAL_THRESHOLDS.futuresRepricingLookbackDays);
    if (dist > SIGNAL_THRESHOLDS.futuresRepricingLookbackToleranceDays) continue;
    if (dist < bestDist || (dist === bestDist && date > (prior ?? ""))) {
      prior = date;
      bestDist = dist;
    }
  }
  return prior;
}

function readSnapshotFile(): SnapshotFile | null {
  try {
    if (!existsSync(SNAPSHOTS_PATH)) return null;
    return JSON.parse(readFileSync(SNAPSHOTS_PATH, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

function readCurveIdentityFromDisk(): CurveIdentity[] | null {
  try {
    if (!existsSync(CURVE_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(CURVE_CACHE_PATH, "utf8")) as {
      payload?: {
        curves?: Array<{
          id: string;
          name: string;
          enabled: boolean;
          sessionDate: string | null;
          points: CurveIdentityPoint[];
        }>;
      };
    };
    const curves = raw.payload?.curves;
    if (!Array.isArray(curves) || curves.length === 0) return null;
    const out: CurveIdentity[] = [];
    for (const curve of curves) {
      const spec = futuresCurveSpecById(curve.id);
      if (!spec || !FORWARD_CURVE_IDS.includes(curve.id as (typeof FORWARD_CURVE_IDS)[number])) {
        continue;
      }
      out.push({
        id: curve.id,
        name: curve.name,
        sessionDate: curve.sessionDate,
        enabled: curve.enabled,
        points: curve.points ?? [],
        root: spec.root,
        venue: spec.venue,
        currency: spec.currency,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function loadCurveIdentities(): Promise<CurveIdentity[]> {
  const cached = readCurveIdentityFromDisk();
  if (cached && cached.some((c) => c.enabled && c.sessionDate && c.points.length >= 2)) {
    return cached;
  }
  const term = await loadFuturesTermStructure();
  return term.curves
    .filter((curve) => FORWARD_CURVE_IDS.includes(curve.id as (typeof FORWARD_CURVE_IDS)[number]))
    .map((curve) => {
      const spec = futuresCurveSpecById(curve.id) as FuturesCurveSpec;
      return {
        id: curve.id,
        name: curve.name,
        sessionDate: curve.sessionDate,
        enabled: curve.enabled,
        points: curve.points.map((p) => ({
          year: p.year,
          monthIndex: p.monthIndex,
          price: p.price,
          gap: p.gap,
          symbol: p.symbol,
        })),
        root: spec.root,
        venue: spec.venue,
        currency: spec.currency,
      };
    });
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchYahooDailySeries(symbol: string): Promise<YahooSeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(YAHOO_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
          };
          meta?: { symbol?: string; instrumentType?: string; currency?: string };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!result || !meta) return null;
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const volumes = result.indicators?.quote?.[0]?.volume ?? [];
    const byDate = new Map<string, YahooBar>();
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      const ts = timestamps[i];
      if (typeof close !== "number" || !(close > 0) || typeof ts !== "number") continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      const vol = volumes[i];
      byDate.set(date, {
        date,
        close,
        volume: typeof vol === "number" && vol >= 0 ? vol : null,
      });
    }
    return {
      bars: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      currency: meta.currency ?? null,
      instrumentType: meta.instrumentType ?? null,
      metaSymbol: meta.symbol ?? null,
    };
  } catch {
    return null;
  }
}

function tryCmeSameContract(
  curveId: string,
  commodityName: string,
  spec: FuturesCurveSpec | undefined,
  sessionsRaw: CurveSessionSnapshot[],
  sharedAsOf: string | null,
): ForwardRepricingInput | null {
  if (!Array.isArray(sessionsRaw) || sessionsRaw.length < 2) return null;
  const sessions = [...sessionsRaw].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  const asOfCandidates = sharedAsOf
    ? sessions.filter((s) => s.sessionDate === sharedAsOf)
    : sessions.slice(0, 1);
  const current = asOfCandidates[0] ?? null;
  if (!current) return null;

  const priorDate = pickPriorSessionDate(
    sessions.map((s) => s.sessionDate),
    current.sessionDate,
  );
  if (!priorDate) return null;
  const prior = sessions.find((s) => s.sessionDate === priorDate);
  if (!prior) return null;

  const currentRows = pricedRows(current);
  const priorRows = pricedRows(prior);
  if (currentRows.length < 2 || priorRows.length < 2) return null;

  const front = selectFrontMonth(currentRows);
  const six = selectSixMonthTarget(currentRows, current.sessionDate);
  if (!front || !six) return null;

  const priorFront = findSameContract(priorRows, front.year, front.monthIndex);
  const priorSix = findSameContract(priorRows, six.year, six.monthIndex);
  if (!priorFront || !priorSix) return null;

  const sixMonthRet = sameContractReturn(six, priorSix);
  const frontMonthRet = sameContractReturn(front, priorFront);
  if (sixMonthRet == null || frontMonthRet == null) return null;

  const frontSymbol = spec
    ? symbolFor(spec.root, spec.venue, front.year, front.monthIndex)
    : `${front.year}-${front.monthIndex}`;
  const sixSymbol = spec
    ? symbolFor(spec.root, spec.venue, six.year, six.monthIndex)
    : `${six.year}-${six.monthIndex}`;

  return {
    commodityId: curveId,
    commodityName,
    sixMonthRet,
    frontMonthRet,
    sixMonthContractLabel: contractLabel(six.monthIndex, six.year),
    frontMonthContractLabel: contractLabel(front.monthIndex, front.year),
    sixMonthSymbol: sixSymbol,
    frontMonthSymbol: frontSymbol,
    currentSettleDate: current.sessionDate,
    priorSettleDate: prior.sessionDate,
    priceSource: "cme-settlement",
    priceType: "official settlement",
  };
}

function yahooObservationOnDate(
  identity: CurveIdentity,
  front: { year: number; monthIndex: number; symbol: string },
  six: { year: number; monthIndex: number; symbol: string },
  frontSeries: YahooSeries,
  sixSeries: YahooSeries,
  asOf: string,
  completedBefore: string,
): ForwardRepricingInput | null {
  if (asOf >= completedBefore) return null;

  const frontByDate = new Map(frontSeries.bars.map((b) => [b.date, b]));
  const sixByDate = new Map(sixSeries.bars.map((b) => [b.date, b]));
  const frontAsOf = frontByDate.get(asOf);
  const sixAsOf = sixByDate.get(asOf);
  if (!frontAsOf || !sixAsOf) return null;

  // Strict zero-volume filter for Yahoo (settlements may have volume 0).
  if (frontAsOf.volume === 0 || sixAsOf.volume === 0) return null;

  const commonDates = frontSeries.bars
    .map((b) => b.date)
    .filter((d) => sixByDate.has(d) && d < asOf);
  const prior = pickPriorSessionDate(commonDates, asOf);
  if (!prior) return null;
  const frontPrior = frontByDate.get(prior);
  const sixPrior = sixByDate.get(prior);
  if (!frontPrior || !sixPrior) return null;
  if (frontPrior.volume === 0 || sixPrior.volume === 0) return null;
  if (!(frontAsOf.close > 0) || !(frontPrior.close > 0) || !(sixAsOf.close > 0) || !(sixPrior.close > 0)) {
    return null;
  }

  const currencyOk =
    Boolean(frontSeries.currency) &&
    Boolean(sixSeries.currency) &&
    frontSeries.currency === sixSeries.currency &&
    frontSeries.currency === identity.currency;
  if (!currencyOk) return null;

  return {
    commodityId: identity.id,
    commodityName: identity.name,
    sixMonthRet: sixAsOf.close / sixPrior.close - 1,
    frontMonthRet: frontAsOf.close / frontPrior.close - 1,
    sixMonthContractLabel: contractLabel(six.monthIndex, six.year),
    frontMonthContractLabel: contractLabel(front.monthIndex, front.year),
    sixMonthSymbol: six.symbol,
    frontMonthSymbol: front.symbol,
    currentSettleDate: asOf,
    priorSettleDate: prior,
    priceSource: "yahoo-close",
    priceType: "daily close",
  };
}

/**
 * Forward repricing hierarchy:
 * 1) CME settlement-to-settlement when verified snapshot history allows
 * 2) Yahoo same-contract close-to-close fallback
 * 3) Exclude if neither consistent comparison is available
 *
 * Never mixes CME settlements with Yahoo closes within one commodity.
 * Ranks only on a shared completed asOf across eligible commodities.
 */
async function evaluateForwardRepricing(indicators: HistoryIndicator[]): Promise<{
  active: boolean;
  reason: string | null;
  rows: ForwardRepricingInput[];
}> {
  const nameById = new Map(indicators.map((row) => [row.id, row.name]));
  const completedBefore = exchangeTodayIso();
  const snapshotFile = readSnapshotFile();

  let identities: CurveIdentity[] = [];
  try {
    identities = await loadCurveIdentities();
  } catch {
    identities = [];
  }

  // --- Pass 1: CME settlement candidates (completed sessions only) ---
  const cmeById = new Map<string, ForwardRepricingInput>();
  if (snapshotFile?.curves) {
    for (const curveId of FORWARD_CURVE_IDS) {
      const sessions = snapshotFile.curves[curveId];
      if (!sessions?.length) continue;
      const completed = sessions.filter((s) => s.sessionDate < completedBefore);
      const spec = futuresCurveSpecById(curveId);
      const name =
        nameById.get(curveId) ??
        identities.find((c) => c.id === curveId)?.name ??
        CURVE_DISPLAY_NAMES[curveId] ??
        curveId;
      const row = tryCmeSameContract(curveId, name, spec, completed, null);
      if (row) cmeById.set(curveId, row);
    }
  }

  // --- Pass 2: Yahoo close-to-close candidates ---
  type YahooPrep = {
    identity: CurveIdentity;
    front: { year: number; monthIndex: number; symbol: string };
    six: { year: number; monthIndex: number; symbol: string };
    frontSeries: YahooSeries;
    sixSeries: YahooSeries;
    preferred: ForwardRepricingInput | null;
  };

  const yahooPreps: YahooPrep[] = [];
  const identityList = identities.filter((c) => c.enabled && c.sessionDate && c.points.length >= 2);

  const prepared = await mapLimited(identityList, YAHOO_CONCURRENCY, async (identity) => {
    if (cmeById.has(identity.id)) return null;

    const priced = identity.points
      .filter((p) => !p.gap && p.price != null && p.price > 0)
      .map((p) => ({
        year: p.year,
        monthIndex: p.monthIndex,
        price: p.price as number,
        gap: false,
      }));
    const frontRow = selectFrontMonth(priced);
    const sixRow = selectSixMonthTarget(priced, identity.sessionDate!);
    if (!frontRow || !sixRow) return null;

    const frontSymbol =
      identity.points.find(
        (p) => p.year === frontRow.year && p.monthIndex === frontRow.monthIndex && p.symbol,
      )?.symbol ?? symbolFor(identity.root, identity.venue, frontRow.year, frontRow.monthIndex);
    const sixSymbol =
      identity.points.find(
        (p) => p.year === sixRow.year && p.monthIndex === sixRow.monthIndex && p.symbol,
      )?.symbol ?? symbolFor(identity.root, identity.venue, sixRow.year, sixRow.monthIndex);

    const [frontSeries, sixSeries] = await Promise.all([
      fetchYahooDailySeries(frontSymbol),
      fetchYahooDailySeries(sixSymbol),
    ]);
    if (
      !frontSeries ||
      frontSeries.instrumentType !== "FUTURE" ||
      frontSeries.metaSymbol !== frontSymbol ||
      !sixSeries ||
      sixSeries.instrumentType !== "FUTURE" ||
      sixSeries.metaSymbol !== sixSymbol
    ) {
      return null;
    }

    const front = { year: frontRow.year, monthIndex: frontRow.monthIndex, symbol: frontSymbol };
    const six = { year: sixRow.year, monthIndex: sixRow.monthIndex, symbol: sixSymbol };

    const sixByDate = new Map(sixSeries.bars.map((b) => [b.date, b]));
    const commonCompleted = frontSeries.bars
      .map((b) => b.date)
      .filter((d) => sixByDate.has(d) && d < completedBefore)
      .sort();
    const preferredAsOf = commonCompleted[commonCompleted.length - 1] ?? null;
    const preferred = preferredAsOf
      ? yahooObservationOnDate(
          identity,
          front,
          six,
          frontSeries,
          sixSeries,
          preferredAsOf,
          completedBefore,
        )
      : null;

    return { identity, front, six, frontSeries, sixSeries, preferred } satisfies YahooPrep;
  });

  for (const prep of prepared) {
    if (prep) yahooPreps.push(prep);
  }

  // --- Align on a shared completed asOf (do not rank mixed dates) ---
  const preferredPool: ForwardRepricingInput[] = [
    ...cmeById.values(),
    ...yahooPreps.map((p) => p.preferred).filter((r): r is ForwardRepricingInput => r != null),
  ];

  const asOfCounts = new Map<string, number>();
  for (const row of preferredPool) {
    asOfCounts.set(row.currentSettleDate, (asOfCounts.get(row.currentSettleDate) ?? 0) + 1);
  }

  let sharedAsOf: string | null = null;
  for (const [date, count] of [...asOfCounts.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (count >= SIGNAL_THRESHOLDS.futuresRepricingMinCommodities && date < completedBefore) {
      sharedAsOf = date;
      break;
    }
  }

  // If preferred dates fragment, pick latest completed date where ≥2 can be recomputed.
  if (!sharedAsOf) {
    const candidateDates = new Set<string>();
    for (const row of cmeById.values()) candidateDates.add(row.currentSettleDate);
    for (const prep of yahooPreps) {
      for (const bar of prep.frontSeries.bars) {
        if (bar.date < completedBefore) candidateDates.add(bar.date);
      }
    }
    for (const date of [...candidateDates].sort((a, b) => b.localeCompare(a))) {
      let count = 0;
      for (const curveId of FORWARD_CURVE_IDS) {
        if (cmeById.has(curveId) && cmeById.get(curveId)!.currentSettleDate === date) {
          count += 1;
          continue;
        }
        const prep = yahooPreps.find((p) => p.identity.id === curveId);
        if (!prep) continue;
        const obs = yahooObservationOnDate(
          prep.identity,
          prep.front,
          prep.six,
          prep.frontSeries,
          prep.sixSeries,
          date,
          completedBefore,
        );
        if (obs) count += 1;
      }
      if (count >= SIGNAL_THRESHOLDS.futuresRepricingMinCommodities) {
        sharedAsOf = date;
        break;
      }
    }
  }

  if (!sharedAsOf) {
    const cmeN = cmeById.size;
    const yahooN = yahooPreps.filter((p) => p.preferred).length;
    return {
      active: false,
      reason: `Forward repricing inactive: need ≥${SIGNAL_THRESHOLDS.futuresRepricingMinCommodities} commodities with a shared completed session and consistent same-contract 1M comparisons (CME settlement-to-settlement or Yahoo close-to-close; no mixing within a commodity). Have ${cmeN} CME-eligible and ${yahooN} Yahoo-eligible before date alignment (completed before ${completedBefore}).`,
      rows: [],
    };
  }

  const aligned: ForwardRepricingInput[] = [];
  for (const curveId of FORWARD_CURVE_IDS) {
    // Prefer CME when the shared asOf is available as verified settlements.
    if (snapshotFile?.curves[curveId]) {
      const completed = snapshotFile.curves[curveId]!.filter((s) => s.sessionDate < completedBefore);
      const spec = futuresCurveSpecById(curveId);
      const name =
        nameById.get(curveId) ??
        identities.find((c) => c.id === curveId)?.name ??
        CURVE_DISPLAY_NAMES[curveId] ??
        curveId;
      const cme = tryCmeSameContract(curveId, name, spec, completed, sharedAsOf);
      if (cme) {
        aligned.push(cme);
        continue;
      }
    }

    const prep = yahooPreps.find((p) => p.identity.id === curveId);
    if (!prep) continue;
    const yahoo = yahooObservationOnDate(
      prep.identity,
      prep.front,
      prep.six,
      prep.frontSeries,
      prep.sixSeries,
      sharedAsOf,
      completedBefore,
    );
    if (yahoo) aligned.push(yahoo);
  }

  if (aligned.length >= SIGNAL_THRESHOLDS.futuresRepricingMinCommodities) {
    return { active: true, reason: null, rows: aligned };
  }

  return {
    active: false,
    reason: `Forward repricing inactive: after aligning on completed session ${sharedAsOf}, only ${aligned.length} commodit${aligned.length === 1 ? "y" : "ies"} remain eligible (need ≥${SIGNAL_THRESHOLDS.futuresRepricingMinCommodities}).`,
    rows: [],
  };
}

export async function loadCommoditySignals(): Promise<CommoditySignalsPayload> {
  const [indicators, fx] = await Promise.all([loadCommodityIndicators(), loadFxHistory()]);
  const futuresGate = await evaluateForwardRepricing(indicators.history);

  const commodities = indicators.history.map(toSignalCommodity);
  const engine = runSignalEngine(
    commodities,
    fx,
    futuresGate.active ? futuresGate.rows : [],
  );
  const previous = readLifecycleState();
  const withStatus = applyLifecycle(engine.candidates, previous);
  const displayed = rankAndTrim(withStatus);

  const statusByKey = new Map<string, SignalStatus>();
  for (const signal of withStatus) {
    statusByKey.set(signal.lifecycleKey, signal.status);
  }

  // Persist lifecycle from category evaluations (including confirmed inactive).
  // Do not rewrite state when the engine could not establish any evaluation asOf.
  if (engine.evaluations.length > 0) {
    const next = mergeLifecycleState(previous, engine.evaluations, statusByKey);
    writeLifecycleState(next);
  }

  return {
    signals: displayed,
    qualifyingIds: withStatus.map((s) => s.lifecycleKey),
    activeCount: displayed.length,
    newCount: displayed.filter((s) => s.status === "NEW").length,
    asOf: engine.asOf,
    fetchedAt: new Date().toISOString(),
    fromStaleCache: indicators.fromStaleCache,
    coverageInsufficient: engine.coverageInsufficient,
    futuresRepricingActive: futuresGate.active,
    futuresRepricingInactiveReason: futuresGate.reason,
  };
}

export async function loadCommoditySignalsSafe(): Promise<CommoditySignalsPayload> {
  try {
    return await loadCommoditySignals();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signal engine failed.";
    return emptySignalsPayload({
      coverageInsufficient: true,
      futuresRepricingInactiveReason: message,
    });
  }
}
