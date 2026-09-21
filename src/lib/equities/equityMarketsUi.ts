import { EQUITY_MARKETS } from "./equityMarketsRegistry";
import { change1dPercentForRow, change1mPercent } from "./equityDayChange";
import { equityStatusLabel } from "./equityMarketStatus";
import type { EquityMarketQuote, EquityMarketRow, EquityMarketsPayload } from "./types";

export function mergeEquityRows(payload: EquityMarketsPayload | undefined): EquityMarketRow[] {
  const quoteById = new Map((payload?.quotes ?? []).map((q) => [q.countryId, q]));
  return EQUITY_MARKETS.map((config) => {
    const quote: EquityMarketQuote = quoteById.get(config.countryId) ?? {
      countryId: config.countryId,
      price: null,
      changePercent: null,
      status: "unavailable",
      source: config.source,
      error: "Not loaded",
    };
    return {
      ...config,
      ...quote,
      displayStatus: equityStatusLabel(quote.status),
    };
  });
}

export function fmtEquityPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtChangePct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export type EquitySummaryLeader = Readonly<{
  row: EquityMarketRow;
  changePercent: number;
}>;

export type EquitySummaryPeriodStats = Readonly<{
  best: EquitySummaryLeader | null;
  worst: EquitySummaryLeader | null;
  averageMove: number | null;
  positiveCount: number;
  negativeCount: number;
  liveCount: number;
}>;

export type EquitySummaryStats = Readonly<{
  day: EquitySummaryPeriodStats;
  month: EquitySummaryPeriodStats;
}>;

const BREADTH_EPS = 0.05;

function computePeriodSummary(
  rows: EquityMarketRow[],
  getChange: (row: EquityMarketRow) => number | null,
): EquitySummaryPeriodStats {
  const available = rows
    .filter((r) => r.status !== "unavailable")
    .map((row) => ({ row, changePercent: getChange(row) }))
    .filter(
      (entry): entry is EquitySummaryLeader =>
        entry.changePercent !== null && Number.isFinite(entry.changePercent),
    );

  if (!available.length) {
    return {
      best: null,
      worst: null,
      averageMove: null,
      positiveCount: 0,
      negativeCount: 0,
      liveCount: 0,
    };
  }

  const sorted = [...available].sort((a, b) => b.changePercent - a.changePercent);
  const avg = available.reduce((sum, entry) => sum + entry.changePercent, 0) / available.length;

  return {
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
    averageMove: avg,
    positiveCount: available.filter((entry) => entry.changePercent > BREADTH_EPS).length,
    negativeCount: available.filter((entry) => entry.changePercent < -BREADTH_EPS).length,
    liveCount: available.length,
  };
}

export function computeEquitySummary(rows: EquityMarketRow[]): EquitySummaryStats {
  const empty: EquitySummaryPeriodStats = {
    best: null,
    worst: null,
    averageMove: null,
    positiveCount: 0,
    negativeCount: 0,
    liveCount: 0,
  };

  if (!rows.length) {
    return { day: empty, month: empty };
  }

  return {
    day: computePeriodSummary(rows, change1dPercentForRow),
    month: computePeriodSummary(rows, change1mPercent),
  };
}
