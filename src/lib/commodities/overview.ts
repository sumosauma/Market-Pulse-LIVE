export type CommodityGroupId = "energy" | "metals" | "agriculture";

export type CommodityKind = "futures" | "spot" | "benchmark";

export type CommodityPoint = {
  date: string;
  price: number;
};

export type CommodityQuote = {
  id: string;
  name: string;
  group: CommodityGroupId;
  kind: CommodityKind;
  price: number | null;
  unit: string | null;
  changePercent1d: number | null;
  /** Why the 1-day change is blank when a price is present. */
  changeNote: string | null;
  /** ISO timestamp, or `YYYY-MM-DD` when the source publishes a date only. */
  asOf: string | null;
  sourceLabel: string | null;
  contractLabel: string;
  chart: CommodityPoint[];
  chartLabel: string | null;
  /** Shown instead of a chart when the price exists but history does not. */
  historyNote: string | null;
  unavailableReason: string | null;
  stale: boolean;
};

export type CommodityOverview = {
  quotes: CommodityQuote[];
  fetchedAt: string;
  fromStaleCache: boolean;
};

export const COMMODITY_GROUPS: { id: CommodityGroupId; label: string }[] = [
  { id: "energy", label: "Energy" },
  { id: "metals", label: "Metals" },
  { id: "agriculture", label: "Agriculture" },
];

const CHART_MIN_POINTS = 10;
const CHART_MAX_POINTS = 270;

export function percentChange(price: number, previous: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) return null;
  return ((price - previous) / previous) * 100;
}

export function utcDateDaysFromToday(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calendarDaysBetween(earlier: string, later: string): number | null {
  const a = Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${later.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function trimChart(points: CommodityPoint[]): CommodityPoint[] {
  const clean = points.filter((p) => Number.isFinite(p.price));
  if (clean.length < CHART_MIN_POINTS) return [];
  return clean.slice(-CHART_MAX_POINTS);
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** LME cash-settlement column from a Westmetall market-data table. Newest row is not assumed. */
export function parseWestmetallCash(
  html: string,
  expectedHeader: string,
): CommodityPoint[] | null {
  const cashAt = html.indexOf(expectedHeader);
  if (cashAt < 0) return null;
  const threeMonthAt = html.indexOf("3-month");
  if (threeMonthAt >= 0 && threeMonthAt < cashAt) return null;

  const points: CommodityPoint[] = [];
  const rowRe =
    /<td[^>]*>\s*(\d{1,2})\.\s+([A-Za-z]+)\s+(\d{4})\s*<\/td>\s*<td[^>]*>\s*([0-9][0-9,]*(?:\.\d+)?)\s*<\/td>/gi;
  for (const match of html.matchAll(rowRe)) {
    const month = MONTHS[match[2]!.toLowerCase()];
    const price = Number(match[4]!.replace(/,/g, ""));
    if (!month || !Number.isFinite(price)) continue;
    const date = `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
    points.push({ date, price });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  const deduped: CommodityPoint[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (prev?.date === point.date) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped.length > 0 ? deduped : null;
}
