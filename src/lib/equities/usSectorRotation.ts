import {
  change1dPercentFromDailyHistory,
  changeOverTradingDays,
  EQUITY_1M_TRADING_DAYS,
} from "./equityDayChange";
import { SECTOR_DISPLAY_ORDER } from "./sectorRotationMarkets";

export const SECTOR_PERIODS = ["1D", "1W", "1M", "3M"] as const;
export type SectorPeriodId = (typeof SECTOR_PERIODS)[number];

/** Same trading-day windows as the equity table: 1D, 5D, 21D, and ~3 months. */
export const SECTOR_LOOKBACK: Record<SectorPeriodId, number> = {
  "1D": 1,
  "1W": 5,
  "1M": EQUITY_1M_TRADING_DAYS,
  "3M": 63,
};

export type SectorBasket = "cyclical" | "defensive" | "other";

const GROWTH_NAMES = ["Technology", "Consumer Discretionary", "Communication Services"] as const;
const REFLATION_NAMES = ["Financials", "Industrials", "Materials"] as const;
const DEFENSIVE_NAMES = ["Consumer Staples", "Health Care", "Utilities"] as const;
const COMMODITY_NAMES = ["Energy", "Materials"] as const;

export type SectorPeriodReturns = Record<SectorPeriodId, number | null>;

export type UsSectorSeries = Readonly<{
  symbol: string;
  name: string;
  basket: SectorBasket;
  returns: SectorPeriodReturns;
}>;

export type UsSectorRotationPayload = Readonly<{
  market: "US" | "SE";
  fetchedAt: string;
  sectors: readonly UsSectorSeries[];
  benchmark: SectorPeriodReturns | null;
}>;

export type SectorRotationRow = Readonly<{
  symbol: string;
  name: string;
  basket: SectorBasket;
  absolute: number | null;
  relative: number | null;
}>;

export type RotationRegimeId =
  | "growth"
  | "cyclical"
  | "defensive"
  | "commodity"
  | "mixed";

export type RotationRegime = Readonly<{
  id: RotationRegimeId;
  label: string;
  detail: string;
}>;

const REGIME_LABEL: Record<RotationRegimeId, string> = {
  growth: "Growth / Risk-On",
  cyclical: "Cyclical / Reflation",
  defensive: "Defensive / Risk-Off",
  commodity: "Commodity / Inflation",
  mixed: "Mixed / No Clear Rotation",
};

export function emptyPeriodReturns(): SectorPeriodReturns {
  return { "1D": null, "1W": null, "1M": null, "3M": null };
}

export function returnsFromCloses(closes: readonly number[]): SectorPeriodReturns {
  const history = closes.map((price) => ({ price }));
  const row = { price: closes[closes.length - 1] ?? null, history };
  const out = emptyPeriodReturns();
  for (const period of SECTOR_PERIODS) {
    out[period] =
      period === "1D"
        ? change1dPercentFromDailyHistory(history, row.price)
        : changeOverTradingDays(row, SECTOR_LOOKBACK[period]);
  }
  return out;
}

export function relativeReturn(sector: number | null, benchmark: number | null): number | null {
  if (sector == null || benchmark == null) return null;
  if (!Number.isFinite(sector) || !Number.isFinite(benchmark)) return null;
  return sector - benchmark;
}

export function averageReturn(values: readonly (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

export function rowsForPeriod(
  payload: UsSectorRotationPayload,
  period: SectorPeriodId,
): SectorRotationRow[] {
  const benchmark = payload.benchmark?.[period] ?? null;
  const rows = payload.sectors.map((sector) => ({
    symbol: sector.symbol,
    name: sector.name,
    basket: sector.basket,
    absolute: sector.returns[period],
    relative: relativeReturn(sector.returns[period], benchmark),
  }));

  const order = new Map<string, number>(SECTOR_DISPLAY_ORDER.map((name, index) => [name, index]));
  return rows.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

function rankByRelative(rows: readonly SectorRotationRow[]): SectorRotationRow[] {
  return rows
    .filter((row) => row.relative != null)
    .sort((a, b) => b.relative! - a.relative! || a.name.localeCompare(b.name));
}

function byName(rows: readonly SectorRotationRow[], name: string): SectorRotationRow | undefined {
  return rows.find((row) => row.name === name);
}

function valuesFor(rows: readonly SectorRotationRow[], names: readonly string[], field: "absolute" | "relative"): (number | null)[] {
  return names.map((name) => byName(rows, name)?.[field] ?? null);
}

function broadRelativeStrength(values: readonly (number | null)[]): boolean {
  const available = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (available.length < 2) return false;
  const positive = available.filter((v) => v > 0).length;
  return positive / available.length >= 2 / 3;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function leadingNames(rows: readonly SectorRotationRow[], names: readonly string[]): string[] {
  return names
    .map((name) => byName(rows, name))
    .filter((row): row is SectorRotationRow => row != null && row.relative != null && row.relative > 0)
    .map((row) => row.name);
}

export function rotationSnapshot(rows: readonly SectorRotationRow[]): Readonly<{
  leading: SectorRotationRow | null;
  lagging: SectorRotationRow | null;
  cyclicalAvg: number | null;
  defensiveAvg: number | null;
  spread: number | null;
}> {
  const ranked = rankByRelative(rows);
  const cyclicalAvg = averageReturn(
    rows.filter((row) => row.basket === "cyclical").map((row) => row.absolute),
  );
  const defensiveAvg = averageReturn(
    rows.filter((row) => row.basket === "defensive").map((row) => row.absolute),
  );
  return {
    leading: ranked[0] ?? null,
    lagging: ranked.length ? ranked[ranked.length - 1]! : null,
    cyclicalAvg,
    defensiveAvg,
    spread: cyclicalAvg != null && defensiveAvg != null ? cyclicalAvg - defensiveAvg : null,
  };
}

export function classifyRotation(rows: readonly SectorRotationRow[]): RotationRegime {
  const growthRels = valuesFor(rows, GROWTH_NAMES, "relative");
  const reflationRels = valuesFor(rows, REFLATION_NAMES, "relative");
  const defensiveRels = valuesFor(rows, DEFENSIVE_NAMES, "relative");
  const snapshot = rotationSnapshot(rows);
  const ranked = rankByRelative(rows);
  const top = new Set(ranked.slice(0, 3).map((row) => row.name));
  const commodity =
    ranked.length >= 6 && COMMODITY_NAMES.every((name) => top.has(name));

  const candidates: { id: RotationRegimeId; score: number }[] = [];
  if (
    broadRelativeStrength(defensiveRels) &&
    snapshot.defensiveAvg != null &&
    snapshot.cyclicalAvg != null &&
    snapshot.defensiveAvg > snapshot.cyclicalAvg
  ) {
    candidates.push({ id: "defensive", score: averageReturn(defensiveRels) ?? 0 });
  }
  if (commodity) {
    candidates.push({
      id: "commodity",
      score: averageReturn(valuesFor(rows, COMMODITY_NAMES, "relative")) ?? 0,
    });
  }
  if (broadRelativeStrength(reflationRels)) {
    candidates.push({ id: "cyclical", score: averageReturn(reflationRels) ?? 0 });
  }
  if (
    broadRelativeStrength(growthRels) &&
    snapshot.cyclicalAvg != null &&
    snapshot.defensiveAvg != null &&
    snapshot.cyclicalAvg >= snapshot.defensiveAvg
  ) {
    candidates.push({ id: "growth", score: averageReturn(growthRels) ?? 0 });
  }

  const winner = candidates.sort((a, b) => b.score - a.score)[0]?.id ?? "mixed";
  return {
    id: winner,
    label: REGIME_LABEL[winner],
    detail: regimeDetail(winner, rows),
  };
}

function regimeDetail(id: RotationRegimeId, rows: readonly SectorRotationRow[]): string {
  if (id === "growth") {
    const names = leadingNames(rows, GROWTH_NAMES);
    const lead = joinNames(names.length ? names : ["Technology"]);
    return `${lead} leading while defensives lag.`;
  }
  if (id === "cyclical") {
    const names = leadingNames(rows, REFLATION_NAMES);
    const lead = joinNames(names.length ? names : ["Financials", "Industrials", "Materials"]);
    return `${lead} leading.`;
  }
  if (id === "defensive") {
    const names = leadingNames(rows, DEFENSIVE_NAMES);
    const lead = joinNames(names.length ? names : ["Utilities", "Consumer Staples", "Health Care"]);
    return `${lead} leading while cyclicals lag.`;
  }
  if (id === "commodity") {
    return "Energy and Materials are among the strongest sectors.";
  }
  return "Leadership is dispersed across sectors.";
}
