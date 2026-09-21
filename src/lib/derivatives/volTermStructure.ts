/** Constant-maturity cash vol-index term structure. Never futures, V6I* sub-indices, or ATM IV. */

import {
  calculatePercentile,
  dedupeDatedCloses,
  PERCENTILE_LOOKBACK_SESSIONS,
  PERCENTILE_MIN_OBSERVATIONS,
} from "./percentile";

export const VOL_TERM_MATURITIES = ["1M", "3M", "6M", "1Y"] as const;
export type VolTermMaturity = (typeof VOL_TERM_MATURITIES)[number];

export type VolTermMarketId = "spx" | "sx5e";
export type VolTermCurveShape = "Contango" | "Flat" | "Backwardation";
export type VolTermSourceKind = "cboe-csv" | "stoxx-txt";

export const VOL_TERM_SHAPE_THRESHOLD = 0.5;
export const VOL_TERM_MAX_LAG_DAYS = 14;

export const VOL_TERM_EXPLAINER =
  "Volatility term structure shows how annualized implied volatility changes across different option maturities. Contango (an upward-sloping curve) means longer-dated volatility is priced above short-dated volatility. Backwardation (a downward-sloping curve) means short-dated volatility is priced above longer-dated volatility, which can occur during periods of acute market stress or near-term event risk.";

export const VOL_TERM_METHODOLOGY_NOTE =
  "These are constant-maturity cash volatility indices, not volatility futures or single-option ATM IVs.";

export type VolTermSeriesDef = {
  marketId: VolTermMarketId;
  marketLabel: string;
  maturity: VolTermMaturity;
  ticker: string;
  indexName: string;
  sourceKind: VolTermSourceKind;
  sourceFile: string;
  sourceUrl: string;
  expectedSymbol: string | null;
};

export const VOL_TERM_SERIES: readonly VolTermSeriesDef[] = [
  {
    marketId: "spx",
    marketLabel: "S&P 500",
    maturity: "1M",
    ticker: "VIX",
    indexName: "Cboe Volatility Index",
    sourceKind: "cboe-csv",
    sourceFile: "VIX_History.csv",
    sourceUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv",
    expectedSymbol: null,
  },
  {
    marketId: "spx",
    marketLabel: "S&P 500",
    maturity: "3M",
    ticker: "VIX3M",
    indexName: "Cboe 3-Month Volatility Index",
    sourceKind: "cboe-csv",
    sourceFile: "VIX3M_History.csv",
    sourceUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv",
    expectedSymbol: null,
  },
  {
    marketId: "spx",
    marketLabel: "S&P 500",
    maturity: "6M",
    ticker: "VIX6M",
    indexName: "Cboe 6-Month Volatility Index",
    sourceKind: "cboe-csv",
    sourceFile: "VIX6M_History.csv",
    sourceUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX6M_History.csv",
    expectedSymbol: null,
  },
  {
    marketId: "spx",
    marketLabel: "S&P 500",
    maturity: "1Y",
    ticker: "VIX1Y",
    indexName: "Cboe 1-Year Volatility Index",
    sourceKind: "cboe-csv",
    sourceFile: "VIX1Y_History.csv",
    sourceUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX1Y_History.csv",
    expectedSymbol: null,
  },
  {
    marketId: "sx5e",
    marketLabel: "EURO STOXX 50",
    maturity: "1M",
    ticker: "V2TX",
    indexName: "VSTOXX",
    sourceKind: "stoxx-txt",
    sourceFile: "h_v2tx.txt",
    sourceUrl: "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_v2tx.txt",
    expectedSymbol: "V2TX",
  },
  {
    marketId: "sx5e",
    marketLabel: "EURO STOXX 50",
    maturity: "3M",
    ticker: "VSTX90",
    indexName: "VSTOXX 90 Days",
    sourceKind: "stoxx-txt",
    sourceFile: "h_vstx90.txt",
    sourceUrl: "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_vstx90.txt",
    expectedSymbol: "VSTX90",
  },
  {
    marketId: "sx5e",
    marketLabel: "EURO STOXX 50",
    maturity: "6M",
    ticker: "VSTX180",
    indexName: "VSTOXX 180 Days",
    sourceKind: "stoxx-txt",
    sourceFile: "h_vstx180.txt",
    sourceUrl: "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_vstx180.txt",
    expectedSymbol: "VSTX180",
  },
  {
    marketId: "sx5e",
    marketLabel: "EURO STOXX 50",
    maturity: "1Y",
    ticker: "VSTX360",
    indexName: "VSTOXX 360 Days",
    sourceKind: "stoxx-txt",
    sourceFile: "h_vstx360.txt",
    sourceUrl: "https://www.stoxx.com/document/Indices/Current/HistoricalData/h_vstx360.txt",
    expectedSymbol: "VSTX360",
  },
];

const REJECTED_STOXX_SYMBOL_RE = /^V6I\d+$/i;

export type VolTermDailyClose = {
  date: string;
  close: number;
};

export type VolTermSeriesHistory = {
  def: VolTermSeriesDef;
  rows: readonly VolTermDailyClose[];
};

export type VolTermPoint = {
  marketId: VolTermMarketId;
  marketLabel: string;
  maturity: VolTermMaturity;
  ticker: string;
  indexName: string;
  value: number;
  sourceFile: string;
  sourceUrl: string;
};

export type VolTermCurve = {
  marketId: VolTermMarketId;
  label: string;
  oneMonth: number;
  oneYear: number;
  shape: VolTermCurveShape;
  points: VolTermPoint[];
};

export type VolTermChartRow = {
  maturity: VolTermMaturity;
  spx: number;
  sx5e: number;
};

export type VolTermSpread = {
  label: string;
  value: number;
  percentile1y: number | null;
  asOf: string;
  observationCount: number;
};

export type VolTermStructurePayload = {
  asOf: string | null;
  fetchedAt: string;
  fromCache: boolean;
  chartRows: VolTermChartRow[] | null;
  spx: VolTermCurve | null;
  sx5e: VolTermCurve | null;
  spxSpread1m3m: VolTermSpread | null;
  spxSpread1m1y: VolTermSpread | null;
  sx5eSpread1m3m: VolTermSpread | null;
  sx5eSpread1m1y: VolTermSpread | null;
  unavailableReason: string | null;
};

export function parseCboeVolHistory(text: string): VolTermDailyClose[] {
  const rows: VolTermDailyClose[] = [];
  const lines = text.split(/\r?\n/);
  let closeIdx = -1;
  let dateIdx = 0;
  let sawHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(",").map((cell) => cell.trim());
    if (!sawHeader) {
      const header = parts.map((p) => p.toUpperCase());
      if (header.some((h) => h === "DATE" || h === "CLOSE")) {
        dateIdx = Math.max(0, header.indexOf("DATE"));
        closeIdx = header.indexOf("CLOSE");
        sawHeader = true;
        continue;
      }
    }
    const date = parseCboeDate(parts[dateIdx] ?? "");
    const closeRaw = closeIdx >= 0 ? parts[closeIdx] : parts[parts.length - 1];
    const close = Number((closeRaw ?? "").replace(",", "."));
    if (date == null || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function parseStoxxVolHistory(text: string, expectedSymbol: string): VolTermDailyClose[] {
  const want = expectedSymbol.trim().toUpperCase();
  if (!want || REJECTED_STOXX_SYMBOL_RE.test(want)) return [];
  const rows: VolTermDailyClose[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("date")) continue;
    const parts = line.split(";");
    if (parts.length < 3) continue;
    const symbol = (parts[1] ?? "").trim().toUpperCase();
    if (REJECTED_STOXX_SYMBOL_RE.test(symbol)) continue;
    if (symbol !== want) continue;
    const close = Number((parts[2] ?? "").trim().replace(",", "."));
    const date = parseStoxxDate((parts[0] ?? "").trim());
    if (date == null || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function historyToDateMap(rows: readonly VolTermDailyClose[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.date, row.close);
  return map;
}

export function findLatestCommonDate(seriesMaps: readonly ReadonlyMap<string, number>[]): string | null {
  if (seriesMaps.length === 0 || seriesMaps.some((m) => m.size === 0)) return null;
  const [first, ...rest] = seriesMaps;
  if (!first) return null;
  let latest: string | null = null;
  for (const date of first.keys()) {
    if (rest.every((m) => m.has(date))) {
      if (latest == null || date > latest) latest = date;
    }
  }
  return latest;
}

export function classifyVolTermShape(oneMonth: number, oneYear: number): VolTermCurveShape | null {
  if (!Number.isFinite(oneMonth) || !Number.isFinite(oneYear)) return null;
  const diff = oneYear - oneMonth;
  if (Math.abs(diff) <= VOL_TERM_SHAPE_THRESHOLD) return "Flat";
  return diff > 0 ? "Contango" : "Backwardation";
}

/** Maps live and previously cached shape labels for display. */
export function displayVolTermShape(shape: string | null | undefined): string {
  if (shape === "Contango" || shape === "Upward") return "Contango";
  if (shape === "Backwardation" || shape === "Inverted") return "Backwardation";
  if (shape === "Flat") return "Flat";
  return "—";
}

export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(`${fromIso}T12:00:00.000Z`);
  const b = Date.parse(`${toIso}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function utcDateIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function computeVolTermYDomain(
  values: readonly (number | null | undefined)[],
): [number, number] | undefined {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return undefined;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(max - min, 1);
  const pad = Math.max(span * 0.15, 0.5);
  return [min - pad, max + pad];
}

export function parseVolTermSeriesText(def: VolTermSeriesDef, text: string): VolTermDailyClose[] {
  if (def.sourceKind === "cboe-csv") return parseCboeVolHistory(text);
  if (def.expectedSymbol == null) return [];
  return parseStoxxVolHistory(text, def.expectedSymbol);
}

export function resolveVolTermStructure(
  histories: readonly VolTermSeriesHistory[],
  todayIso = utcDateIso(),
): Omit<VolTermStructurePayload, "fetchedAt" | "fromCache"> {
  if (histories.length !== VOL_TERM_SERIES.length) {
    return unavailable("Could not load all eight official EOD series.");
  }

  const missing = histories.filter((h) => h.rows.length === 0).map((h) => h.def.sourceFile);
  if (missing.length > 0) {
    return unavailable(`Official EOD unavailable: ${missing.join(", ")}.`);
  }

  const maps = histories.map((h) => historyToDateMap(h.rows));
  const asOf = findLatestCommonDate(maps);
  if (asOf == null) {
    return unavailable("Could not find a shared EOD date across all eight official series.");
  }

  const lag = calendarDaysBetween(asOf, todayIso);
  if (lag == null || lag > VOL_TERM_MAX_LAG_DAYS) {
    return unavailable(
      `No common EOD date within the last ${VOL_TERM_MAX_LAG_DAYS} days across all eight official series.`,
    );
  }

  const points: VolTermPoint[] = [];
  for (let i = 0; i < histories.length; i++) {
    const hist = histories[i]!;
    const value = maps[i]!.get(asOf);
    if (value == null || !Number.isFinite(value) || value <= 0) {
      return unavailable(`Missing ${hist.def.ticker} EOD on ${asOf}.`);
    }
    points.push({
      marketId: hist.def.marketId,
      marketLabel: hist.def.marketLabel,
      maturity: hist.def.maturity,
      ticker: hist.def.ticker,
      indexName: hist.def.indexName,
      value,
      sourceFile: hist.def.sourceFile,
      sourceUrl: hist.def.sourceUrl,
    });
  }

  const spx = buildCurve("spx", "S&P 500", points);
  const sx5e = buildCurve("sx5e", "EURO STOXX 50", points);
  if (!spx || !sx5e) {
    return unavailable("Could not assemble both constant-maturity curves on the common date.");
  }

  const chartRows: VolTermChartRow[] = VOL_TERM_MATURITIES.map((maturity) => {
    const spxPt = spx.points.find((p) => p.maturity === maturity);
    const sx5ePt = sx5e.points.find((p) => p.maturity === maturity);
    return {
      maturity,
      spx: spxPt!.value,
      sx5e: sx5ePt!.value,
    };
  });

  const byTicker = (ticker: string) => histories.find((h) => h.def.ticker === ticker)?.rows ?? null;
  const spxSpread1m3m = resolveTermSpread(byTicker("VIX"), byTicker("VIX3M"), asOf, "1M–3M");
  const spxSpread1m1y = resolveTermSpread(byTicker("VIX"), byTicker("VIX1Y"), asOf, "1M–1Y");
  const sx5eSpread1m3m = resolveTermSpread(byTicker("V2TX"), byTicker("VSTX90"), asOf, "1M–3M");
  const sx5eSpread1m1y = resolveTermSpread(byTicker("V2TX"), byTicker("VSTX360"), asOf, "1M–1Y");

  return {
    asOf,
    chartRows,
    spx,
    sx5e,
    spxSpread1m3m,
    spxSpread1m1y,
    sx5eSpread1m3m,
    sx5eSpread1m1y,
    unavailableReason: null,
  };
}

function buildCurve(
  marketId: VolTermMarketId,
  label: string,
  points: readonly VolTermPoint[],
): VolTermCurve | null {
  const marketPoints = VOL_TERM_MATURITIES.map((maturity) =>
    points.find((p) => p.marketId === marketId && p.maturity === maturity),
  );
  if (marketPoints.some((p) => p == null)) return null;
  const typed = marketPoints as VolTermPoint[];
  const oneMonth = typed[0]!.value;
  const oneYear = typed[3]!.value;
  const shape = classifyVolTermShape(oneMonth, oneYear);
  if (shape == null) return null;
  return { marketId, label, oneMonth, oneYear, shape, points: typed };
}

function unavailable(reason: string): Omit<VolTermStructurePayload, "fetchedAt" | "fromCache"> {
  return {
    asOf: null,
    chartRows: null,
    spx: null,
    sx5e: null,
    spxSpread1m3m: null,
    spxSpread1m1y: null,
    sx5eSpread1m3m: null,
    sx5eSpread1m1y: null,
    unavailableReason: reason,
  };
}

export function commonDateSpreads(
  left: readonly VolTermDailyClose[],
  right: readonly VolTermDailyClose[],
): { date: string; spread: number }[] {
  const leftMap = historyToDateMap(dedupeDatedCloses(left));
  const rightMap = historyToDateMap(dedupeDatedCloses(right));
  const dates: string[] = [];
  for (const date of leftMap.keys()) {
    if (rightMap.has(date)) dates.push(date);
  }
  dates.sort();
  const out: { date: string; spread: number }[] = [];
  for (const date of dates) {
    const a = leftMap.get(date);
    const b = rightMap.get(date);
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push({ date, spread: a - b });
  }
  return out;
}

/** Front-end minus longer tenor on the chart common as-of date, ranked vs last 252 common-date spreads. */
export function resolveTermSpread(
  left: readonly VolTermDailyClose[] | null | undefined,
  right: readonly VolTermDailyClose[] | null | undefined,
  asOf: string,
  label: string,
): VolTermSpread | null {
  if (!left || !right) return null;
  const series = commonDateSpreads(left, right).filter((row) => row.date <= asOf);
  const current = series.find((row) => row.date === asOf);
  if (!current || !Number.isFinite(current.spread)) return null;
  const ranked = calculatePercentile(
    series.map((row) => row.spread),
    current.spread,
    PERCENTILE_LOOKBACK_SESSIONS,
    PERCENTILE_MIN_OBSERVATIONS,
  );
  return {
    label,
    value: current.spread,
    percentile1y: ranked?.percentile ?? null,
    asOf,
    observationCount: ranked?.observationCount ?? Math.min(PERCENTILE_LOOKBACK_SESSIONS, series.length),
  };
}

/** VIX − VIX3M. Kept as a named wrapper so existing tests continue to call the same helper. */
export function resolveSpx1m3mSpread(
  vixRows: readonly VolTermDailyClose[],
  vix3mRows: readonly VolTermDailyClose[],
  asOf: string,
): VolTermSpread | null {
  return resolveTermSpread(vixRows, vix3mRows, asOf, "1M–3M");
}

function parseCboeDate(raw: string): string | null {
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
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
