export type FuturesCurveShape = "Contango" | "Backwardation" | "Flat" | "Mixed";

export type FuturesContractPoint = {
  symbol: string;
  label: string;
  axisLabel: string;
  year: number;
  monthIndex: number;
  /** Null when this delivery month had no trade on the curve session. */
  price: number | null;
  /** True when the month is shown only so the line does not connect across it. */
  gap: boolean;
  /** Session date the price belongs to, `YYYY-MM-DD`. */
  sessionDate: string;
  /** Last trade time. Can be earlier than other months on the same session. */
  quotedAt: string;
  volume: number;
  /** Last trade is more than two hours before the newest trade on this curve. */
  earlierQuote: boolean;
  /** Delivery month is the current exchange month. */
  expiring: boolean;
};

/**
 * Comparison horizons for historical curve overlays.
 * (Distinct from the fixed ~12M display strip / `DISPLAY_CURVE_MONTHS`.)
 */
export const HISTORY_CURVE_HORIZONS = ["today", "1d", "1w", "1m"] as const;
export type HistoryCurveHorizon = (typeof HISTORY_CURVE_HORIZONS)[number];
/** @deprecated Prefer HistoryCurveHorizon — kept as the name requested for history overlays. */
export type HistoryCurveId = HistoryCurveHorizon;

export type HistoricalCurve = {
  horizon: HistoryCurveHorizon;
  /** YYYY-MM-DD session actually used. */
  sessionDate: string | null;
  source: "cme" | "snapshot" | "yahoo" | null;
  points: Array<{ year: number; monthIndex: number; price: number | null }>;
  shape: FuturesCurveShape | null;
  spreadM1M2: number | null;
  spreadM1M2Label: string | null;
  spreadM1M6: number | null;
  spreadM1M6Label: string | null;
  unavailableReason: string | null;
};

export type FuturesCurve = {
  id: string;
  name: string;
  enabled: boolean;
  exchange: string | null;
  currency: string | null;
  unit: string | null;
  digits: number;
  sourceLabel: string | null;
  quotedFrom: string | null;
  quotedTo: string | null;
  /** Newest trade session represented on the curve, `YYYY-MM-DD`. */
  sessionDate: string | null;
  /** Set when the curve mixes earlier trades or more than one session date. */
  sessionNote: string | null;
  /** Set when a spread leg is an earlier same-session trade. */
  spreadCaution: string | null;
  contractNote: string;
  points: FuturesContractPoint[];
  shape: FuturesCurveShape | null;
  spreadM1M2: number | null;
  spreadM1M2Label: string | null;
  spreadM1M6: number | null;
  spreadM1M6Label: string | null;
  unavailableReason: string | null;
  /** Always today + 1d + 1w + 1m (missing horizons carry unavailableReason). */
  history: HistoricalCurve[];
};

export function emptyHistoricalCurves(reason: string | null = null): HistoricalCurve[] {
  return HISTORY_CURVE_HORIZONS.map((horizon) => ({
    horizon,
    sessionDate: null,
    source: null,
    points: [],
    shape: null,
    spreadM1M2: null,
    spreadM1M2Label: null,
    spreadM1M6: null,
    spreadM1M6Label: null,
    unavailableReason: reason ?? (horizon === "today" ? null : "Historical curve unavailable."),
  }));
}

export type FuturesTermStructure = {
  curves: FuturesCurve[];
  fetchedAt: string;
  fromStaleCache: boolean;
};

/** CME month codes. F = January … Z = December. */
export const MONTH_CODES = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"] as const;

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** CBOT grain cycle: March, May, July, September, December. */
export const GRAIN_MONTHS = [2, 4, 6, 8, 11] as const;

/**
 * Legacy COMEX gold “active” months (Feb/Apr/Jun/Aug/Dec).
 * GC futures are now listed monthly for ~24 consecutive months; prefer `monthly` cycle for curves.
 */
export const GOLD_MONTHS = [1, 3, 5, 7, 11] as const;

/**
 * Legacy COMEX silver “active” months (Mar/May/Jul/Sep/Dec).
 * SI futures are now listed monthly for ~24 consecutive months; prefer `monthly` cycle for curves.
 */
export const SILVER_MONTHS = [2, 4, 6, 8, 11] as const;

/** Cap for the 12M UI strip (one point per listed delivery month, plus room for one reach-through). */
export const MAX_CURVE_POINTS = 13;
/** A current-month contract below this share of the next month's volume is left off. */
export const THIN_FRONT_VOLUME_RATIO = 0.05;
/** Same-session trades older than this, versus the newest trade, are flagged. */
export const EARLIER_QUOTE_MS = 2 * 60 * 60 * 1000;
/**
 * Max calendar-day lag behind the newest session date allowed on one curve.
 * Set to 0 after audit: prior-day Yahoo last trades were observed to disagree with
 * independent delayed lasts (e.g. copper Nov-27 printing a session high as "last").
 * Missing months are preferred to mixing non-comparable sessions on one strip.
 */
export const MAX_SESSION_LOOKBACK_DAYS = 0;
/** Max age of a kept quote versus the newest trade kept after the session filter. */
export const MAX_QUOTE_AGE_VS_NEWEST_MS = 36 * 60 * 60 * 1000;

/** A step inside this fraction of the front price is treated as flat. */
const FLAT_FRACTION = 0.0005;

export function contractLabel(monthIndex: number, year: number): string {
  return `${MONTH_SHORT[monthIndex]} ${year}`;
}

export function contractAxisLabel(monthIndex: number, year: number): string {
  return `${MONTH_SHORT[monthIndex]} ${String(year).slice(2)}`;
}

export function nextMonthly(year: number, monthIndex: number): { year: number; monthIndex: number } {
  return monthIndex === 11 ? { year: year + 1, monthIndex: 0 } : { year, monthIndex: monthIndex + 1 };
}

export function nextGrain(year: number, monthIndex: number): { year: number; monthIndex: number } {
  return nextOnCycle(GRAIN_MONTHS, year, monthIndex);
}

export function nextGold(year: number, monthIndex: number): { year: number; monthIndex: number } {
  return nextOnCycle(GOLD_MONTHS, year, monthIndex);
}

export function nextSilver(year: number, monthIndex: number): { year: number; monthIndex: number } {
  return nextOnCycle(SILVER_MONTHS, year, monthIndex);
}

export function nextOnCycle(
  months: readonly number[],
  year: number,
  monthIndex: number,
): { year: number; monthIndex: number } {
  const later = months.find((month) => month > monthIndex);
  if (later != null) return { year, monthIndex: later };
  return { year: year + 1, monthIndex: months[0]! };
}

export function parseContractSymbol(
  symbol: string,
): { root: string; monthIndex: number; year: number } | null {
  const match = symbol.match(/^([A-Z]+)([FGHJKMNQUVXZ])(\d{2})\.[A-Z]+$/);
  if (!match) return null;
  const monthIndex = MONTH_CODES.indexOf(match[2] as (typeof MONTH_CODES)[number]);
  const year = 2000 + Number(match[3]);
  if (monthIndex < 0 || !Number.isFinite(year)) return null;
  return { root: match[1]!, monthIndex, year };
}

/** Month text must agree. A conflicting year rejects the contract; a truncated year does not invent one. */
export function deliveryNameStatus(
  name: string,
  monthIndex: number,
  year: number,
): "match" | "no-month" | "conflict" {
  const hasMonth = name.includes(MONTH_SHORT[monthIndex]!) || name.includes(MONTH_LONG[monthIndex]!);
  if (!hasMonth) return "no-month";
  const fullYears = [...name.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (fullYears.some((value) => value !== year)) return "conflict";
  const shortYear = String(year).slice(2);
  const shortYears = [...name.matchAll(/(?:^|[\s,])(\d{2})(?!\d)/g)].map((match) => match[1]!);
  if (shortYears.some((value) => value !== shortYear)) return "conflict";
  return "match";
}

export type ListedSlot<T> =
  | { kind: "contract"; point: T }
  | { kind: "gap"; year: number; monthIndex: number };

/**
 * Keep every verified contract, in delivery order, up to the cap.
 * A missing step stays a gap. Later contracts are not dropped, and the gap is not filled.
 */
export function buildListedSlots<T extends { year: number; monthIndex: number }>(
  points: T[],
  next: (year: number, monthIndex: number) => { year: number; monthIndex: number },
): ListedSlot<T>[] {
  const sorted = [...points].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  const first = sorted[0];
  if (!first) return [];
  const slots: ListedSlot<T>[] = [{ kind: "contract", point: first }];
  let contracts = 1;
  let last = first;
  for (const point of sorted.slice(1)) {
    if (contracts >= MAX_CURVE_POINTS) break;
    if (point.year < last.year || (point.year === last.year && point.monthIndex <= last.monthIndex)) continue;
    let expected = next(last.year, last.monthIndex);
    let guard = 0;
    while (point.year !== expected.year || point.monthIndex !== expected.monthIndex) {
      slots.push({ kind: "gap", year: expected.year, monthIndex: expected.monthIndex });
      expected = next(expected.year, expected.monthIndex);
      guard += 1;
      if (guard > MAX_CURVE_POINTS) break;
    }
    if (point.year !== expected.year || point.monthIndex !== expected.monthIndex) break;
    slots.push({ kind: "contract", point });
    contracts += 1;
    last = point;
  }
  return slots;
}

export function classifyFuturesCurve(prices: number[]): FuturesCurveShape | null {
  const front = prices[0];
  if (prices.length < 2 || front == null || !(front > 0)) return null;
  const epsilon = front * FLAT_FRACTION;
  let up = 0;
  let down = 0;
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i]! - prices[i - 1]!;
    if (diff > epsilon) up += 1;
    else if (diff < -epsilon) down += 1;
  }
  if (up === 0 && down === 0) return "Flat";
  if (down === 0) return "Contango";
  if (up === 0) return "Backwardation";
  return "Mixed";
}

export function calendarSpread(near: number, deferred: number): number {
  return near - deferred;
}

/** Fixed UI strip window — Futures Curve always displays ~12M forward. */
export const DISPLAY_CURVE_MONTHS = 12;
/** @deprecated Prefer DISPLAY_CURVE_MONTHS — kept for audit scripts that still probe 6M coverage. */
export const CURVE_HORIZONS = ["6M", "12M"] as const;
export type CurveHorizon = (typeof CURVE_HORIZONS)[number];
export const CURVE_HORIZON_MONTHS: Record<CurveHorizon, number> = { "6M": 6, "12M": DISPLAY_CURVE_MONTHS };

/** New York calendar date, which is the calendar already used for the current delivery month. */
export function exchangeCalendarDate(now: Date): { year: number; monthIndex: number; day: number } {
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

/** First day of the contract delivery month. The feed identifies the month, not a day inside it. */
export function deliveryMonthStart(year: number, monthIndex: number): number {
  return Date.UTC(year, monthIndex, 1);
}

/** Last instant of the horizon is the same calendar day, N months ahead. */
export function horizonEndUtc(months: number, now = new Date()): number {
  const today = exchangeCalendarDate(now);
  const monthStart = new Date(Date.UTC(today.year, today.monthIndex + months, 1));
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(today.day, lastDay));
}

export function horizonCutoffIso(months: number, now = new Date()): string {
  return new Date(horizonEndUtc(months, now)).toISOString().slice(0, 10);
}

function isVerifiedPrice(point: FuturesContractPoint): boolean {
  return !point.gap && point.price != null;
}

/**
 * True when a delivery month reaches the horizon’s calendar month
 * (e.g. Nov 2027 for a 12M window starting Nov 2026).
 */
export function reachesHorizonMaturity(
  year: number,
  monthIndex: number,
  months: number,
  now = new Date(),
): boolean {
  const end = new Date(horizonEndUtc(months, now));
  return (
    year > end.getUTCFullYear() ||
    (year === end.getUTCFullYear() && monthIndex >= end.getUTCMonth())
  );
}

/**
 * Display the term structure out to the horizon maturity.
 *
 * Prefer contracts whose delivery month starts on or before the horizon end.
 * When the last such verified contract still falls short of the horizon month
 * (sparse listing cycles such as grains), include the next genuine listed
 * contract beyond the boundary so the strip reaches ~N months forward.
 * No synthetic marks are invented at the cutoff.
 */
export function curveWithinHorizon(curve: FuturesCurve, months: number, now = new Date()): FuturesCurve {
  if (!curve.enabled) return curve;
  const end = horizonEndUtc(months, now);

  let lastInsideIdx = -1;
  for (let i = 0; i < curve.points.length; i++) {
    const point = curve.points[i]!;
    if (deliveryMonthStart(point.year, point.monthIndex) > end) break;
    if (isVerifiedPrice(point)) lastInsideIdx = i;
  }

  let endIdx = lastInsideIdx;
  if (lastInsideIdx >= 0) {
    const lastInside = curve.points[lastInsideIdx]!;
    if (!reachesHorizonMaturity(lastInside.year, lastInside.monthIndex, months, now)) {
      for (let i = lastInsideIdx + 1; i < curve.points.length; i++) {
        const point = curve.points[i]!;
        if (!isVerifiedPrice(point)) continue;
        if (deliveryMonthStart(point.year, point.monthIndex) > end) {
          endIdx = i;
          break;
        }
      }
    }
  }

  const points = endIdx >= 0 ? curve.points.slice(0, endIdx + 1) : [];
  while (points[0]?.gap) points.shift();

  const priced = points.filter(isVerifiedPrice);
  const near = priced[0];
  const second = priced[1];
  const sixth = priced[5];
  const spreadLegs = [near, second, sixth].filter((point): point is FuturesContractPoint => point != null);
  const times = points.map((point) => Date.parse(point.quotedAt)).filter((time) => Number.isFinite(time));
  const earlier = points.some((point) => point.earlierQuote);
  const hasGap = points.some((point) => point.gap);
  const officialSettlements =
    curve.sourceLabel === "CME settlements" || curve.sourceLabel === "CME Daily Bulletin";
  const monthKeys = new Set(points.map((point) => `${point.year}-${point.monthIndex}`));
  const history = (curve.history ?? emptyHistoricalCurves()).map((entry) => {
    if (entry.horizon === "today") {
      return {
        ...entry,
        points: priced.map((point) => ({ year: point.year, monthIndex: point.monthIndex, price: point.price })),
        shape: priced.length >= 2 ? classifyFuturesCurve(priced.map((point) => point.price!)) : null,
        spreadM1M2: near?.price != null && second?.price != null ? calendarSpread(near.price, second.price) : null,
        spreadM1M2Label: near && second ? `${near.label} − ${second.label}` : null,
        spreadM1M6: near?.price != null && sixth?.price != null ? calendarSpread(near.price, sixth.price) : null,
        spreadM1M6Label: near && sixth ? `${near.label} − ${sixth.label}` : null,
        sessionDate: curve.sessionDate,
        source: entry.source ?? (officialSettlements ? "cme" : curve.sourceLabel?.startsWith("Yahoo") ? "yahoo" : null),
        unavailableReason: priced.length >= 2 ? null : entry.unavailableReason,
      };
    }
    const filtered = entry.points.filter((point) => monthKeys.has(`${point.year}-${point.monthIndex}`));
    const histPriced = filtered.filter((point) => point.price != null);
    const hNear = histPriced[0];
    const hSecond = histPriced[1];
    const hSixth = histPriced[5];
    return {
      ...entry,
      points: filtered,
      shape: histPriced.length >= 2 ? classifyFuturesCurve(histPriced.map((point) => point.price!)) : entry.shape,
      spreadM1M2:
        hNear?.price != null && hSecond?.price != null ? calendarSpread(hNear.price, hSecond.price) : null,
      spreadM1M2Label:
        hNear && hSecond
          ? `${contractLabel(hNear.monthIndex, hNear.year)} − ${contractLabel(hSecond.monthIndex, hSecond.year)}`
          : null,
      spreadM1M6:
        hNear?.price != null && hSixth?.price != null ? calendarSpread(hNear.price, hSixth.price) : null,
      spreadM1M6Label:
        hNear && hSixth
          ? `${contractLabel(hNear.monthIndex, hNear.year)} − ${contractLabel(hSixth.monthIndex, hSixth.year)}`
          : null,
    };
  });

  return {
    ...curve,
    points,
    history,
    quotedFrom: times.length ? new Date(Math.min(...times)).toISOString() : null,
    quotedTo: times.length ? new Date(Math.max(...times)).toISOString() : null,
    sessionNote:
      [
        curve.sourceLabel === "CME settlements" && curve.sessionDate
          ? `Official CME Group settlement prices for trade date ${curve.sessionDate}.`
          : curve.sourceLabel === "CME Daily Bulletin" && curve.sessionDate
            ? `Official CME Group Daily Bulletin settlement prices for trade date ${curve.sessionDate}.`
            : curve.sourceLabel?.startsWith("Yahoo")
              ? "CME settlements were unavailable; this strip uses same-session Yahoo last trades only."
              : null,
        earlier
          ? "Some months last traded more than two hours before the newest trade. Those prices are earlier trades from the same session, not a simultaneous snapshot."
          : null,
        hasGap
          ? officialSettlements
            ? "A blank month had no verified mark on this trade date. Later months that did settle stay on the curve, and the line does not cross the blank."
            : "A blank month had no trade on this session. Later months that did trade stay on the curve, and the line does not cross the blank."
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    spreadCaution: spreadLegs.some((point) => point.earlierQuote) ? "One leg last traded earlier in this session." : null,
    shape: priced.length >= 2 ? classifyFuturesCurve(priced.map((point) => point.price!)) : null,
    spreadM1M2: near?.price != null && second?.price != null ? calendarSpread(near.price, second.price) : null,
    spreadM1M2Label: near && second ? `${near.label} − ${second.label}` : null,
    spreadM1M6: near?.price != null && sixth?.price != null ? calendarSpread(near.price, sixth.price) : null,
    spreadM1M6Label: near && sixth ? `${near.label} − ${sixth.label}` : null,
  };
}

/**
 * When the displayed strip’s last verified delivery still falls short of the horizon
 * month (and no further listed contract was available to reach through), return that label.
 */
export function listingsEndLabel(curve: FuturesCurve, months: number, now = new Date()): string | null {
  const displayed = curveWithinHorizon(curve, months, now);
  const verified = displayed.points.filter(isVerifiedPrice);
  const last = verified[verified.length - 1];
  if (!last) return null;
  if (reachesHorizonMaturity(last.year, last.monthIndex, months, now)) return null;
  return last.label;
}

/** True when the horizon-sliced strip’s last verified delivery reaches the horizon month. */
export function curveCoversHorizon(curve: FuturesCurve, months: number, now = new Date()): boolean {
  if (!curve.enabled) return false;
  const displayed = curveWithinHorizon(curve, months, now);
  const last = displayed.points.filter(isVerifiedPrice).at(-1);
  if (!last) return false;
  return reachesHorizonMaturity(last.year, last.monthIndex, months, now);
}

/** Drop a current-month front when it is far less traded than the next listed month. */
export function dropThinCurrentMonthFront<T extends { year: number; monthIndex: number; volume: number }>(
  points: T[],
  current: { year: number; monthIndex: number },
): T[] {
  const out = [...points];
  while (out.length >= 2) {
    const front = out[0]!;
    const next = out[1]!;
    const expiring = front.year === current.year && front.monthIndex === current.monthIndex;
    const thin = next.volume > 0 && front.volume < next.volume * THIN_FRONT_VOLUME_RATIO;
    if (expiring && thin) out.shift();
    else break;
  }
  return out;
}
