import { calculatePercentile, PERCENTILE_LOOKBACK_SESSIONS } from "./percentile";

export const SKEW_LOOKBACK_SESSIONS = PERCENTILE_LOOKBACK_SESSIONS;
export const SKEW_CBOE_HISTORY_URL =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/SKEW_History.csv";

export const SKEW_EXPLAINER =
  "CBOE SKEW reflects the relative pricing of S&P 500 tail outcomes implied by out-of-the-money SPX options. The 1Y percentile shows where the current SKEW level ranks versus approximately the previous 252 trading sessions. Higher readings indicate relatively richer tail-risk pricing, not a prediction that a crash will occur.";

export type SkewTailRisk = "Low" | "Normal" | "Elevated" | "High";

export type SkewDailyClose = {
  date: string;
  close: number;
};

export type SkewIndexRow = {
  last: number | null;
  changePct: number | null;
  percentile1y: number | null;
  tailRisk: SkewTailRisk | null;
  observationCount: number;
  asOf: string | null;
  sourceLabel: string | null;
  unavailableReason: string | null;
};

export function parseCboeSkewHistory(text: string): SkewDailyClose[] {
  const rows: SkewDailyClose[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(",").map((cell) => cell.trim());
    if (parts.length < 2) continue;
    if (/^date$/i.test(parts[0] ?? "")) continue;
    const date = parseCboeDate(parts[0] ?? "");
    const close = Number((parts[1] ?? "").replace(",", "."));
    if (date == null || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function skewChangePct(last: number, prevClose: number): number | null {
  if (!Number.isFinite(last) || !Number.isFinite(prevClose) || !(prevClose > 0)) return null;
  const pct = ((last - prevClose) / prevClose) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function skewOneYearPercentile(current: number, history: readonly number[]): number | null {
  return calculatePercentile(history, current, history.length, 1)?.percentile ?? null;
}

export function classifySkewTailRisk(percentile: number): SkewTailRisk | null {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) return null;
  if (percentile <= 25) return "Low";
  if (percentile <= 75) return "Normal";
  if (percentile <= 90) return "Elevated";
  return "High";
}

export function resolveSkewIndex(history: readonly SkewDailyClose[]): SkewIndexRow | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1]!;
  const prior = history[history.length - 2]!;
  const closes = history.map((row) => row.close);
  const ranked = calculatePercentile(closes, latest.close, SKEW_LOOKBACK_SESSIONS, 1);
  const percentile1y = ranked?.percentile ?? null;
  const tailRisk = percentile1y == null ? null : classifySkewTailRisk(percentile1y);
  return {
    last: latest.close,
    changePct: skewChangePct(latest.close, prior.close),
    percentile1y,
    tailRisk,
    observationCount: ranked?.observationCount ?? 0,
    asOf: latest.date,
    sourceLabel: `CBOE SKEW EOD ${latest.date}`,
    unavailableReason: null,
  };
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
