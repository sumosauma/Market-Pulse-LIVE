import type { ExchangeTz } from "./equityExchangeTz";
import { exchangeLocalMinutesSinceMidnight, exchangeLocalWeekday } from "./equityExchangeTz";

/** Approximate exchange-local regular session hours for 1D chart x-axis (visual only). */
export type SessionWindow = Readonly<{
  /** Minutes from local midnight at session open (e.g. 9:30 → 570). */
  openMinutes: number;
  /** Minutes from local midnight at session close (e.g. 16:00 → 960). */
  closeMinutes: number;
}>;

function clock(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/** Default regular sessions by market — approximate, no holidays or lunch breaks. */
const SESSION_BY_COUNTRY: Record<string, SessionWindow> = {
  US: { openMinutes: clock(9, 30), closeMinutes: clock(16, 0) },
  CA: { openMinutes: clock(9, 30), closeMinutes: clock(16, 0) },
  MX: { openMinutes: clock(8, 30), closeMinutes: clock(15, 0) },
  BR: { openMinutes: clock(10, 0), closeMinutes: clock(17, 0) },

  JP: { openMinutes: clock(9, 0), closeMinutes: clock(15, 0) },
  HK: { openMinutes: clock(9, 30), closeMinutes: clock(16, 0) },
  CN: { openMinutes: clock(9, 30), closeMinutes: clock(15, 0) },
  IN: { openMinutes: clock(9, 15), closeMinutes: clock(15, 30) },
  KR: { openMinutes: clock(9, 0), closeMinutes: clock(15, 30) },
  AU: { openMinutes: clock(10, 0), closeMinutes: clock(16, 0) },

  GB: { openMinutes: clock(8, 0), closeMinutes: clock(16, 30) },
  DE: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  FR: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  IT: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  ES: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  NL: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  CH: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  SE: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  NO: { openMinutes: clock(9, 0), closeMinutes: clock(16, 20) },
  DK: { openMinutes: clock(9, 0), closeMinutes: clock(17, 0) },
  FI: { openMinutes: clock(10, 0), closeMinutes: clock(18, 30) },
  eu500: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  omxn40: { openMinutes: clock(9, 0), closeMinutes: clock(17, 30) },
  nqgi: { openMinutes: clock(9, 30), closeMinutes: clock(16, 0) },

  ZA: { openMinutes: clock(9, 0), closeMinutes: clock(17, 0) },
};

const EUROPE_REGION = new Set(["Europe", "Nordics"]);

const EUROPE_SESSION: SessionWindow = {
  openMinutes: clock(9, 0),
  closeMinutes: clock(17, 30),
};

const US_SESSION: SessionWindow = SESSION_BY_COUNTRY.US;
const ASIA_PACIFIC_DEFAULT: SessionWindow = { openMinutes: clock(9, 0), closeMinutes: clock(16, 0) };

/** Resolve an approximate session window for 1D x-axis positioning. */
export function getSessionWindowForMarket(countryId: string, region?: string): SessionWindow | null {
  const direct = SESSION_BY_COUNTRY[countryId];
  if (direct) return direct;

  if (region && EUROPE_REGION.has(region)) return EUROPE_SESSION;
  if (region === "Americas") return US_SESSION;
  if (region === "Asia-Pacific") return ASIA_PACIFIC_DEFAULT;

  return null;
}

/**
 * Whether exchange-local time is inside configured cash regular session (Mon–Fri).
 * Used for market-open inference when Yahoo omits marketState — no holidays.
 */
export function isWithinCashTradingSession(
  countryId: string,
  region: string | undefined,
  nowIso: string,
  tz: ExchangeTz,
): boolean {
  const window = getSessionWindowForMarket(countryId, region);
  if (!window) return false;

  const weekday = exchangeLocalWeekday(nowIso, tz);
  if (weekday == null || weekday === 0 || weekday === 6) return false;

  const minutes = exchangeLocalMinutesSinceMidnight(nowIso, tz);
  if (minutes == null) return false;

  return minutes >= window.openMinutes && minutes <= window.closeMinutes;
}

/** Format exchange-local clock time for session tick labels. */
export function fmtSessionClock(minutesFromMidnight: number): string {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const d = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Map exchange-local minutes to x within a fixed session window. */
export function mapSessionX(
  minutesLocal: number,
  window: SessionWindow,
  plotLeft: number,
  plotWidth: number,
): number {
  const span = window.closeMinutes - window.openMinutes;
  if (span <= 0) return plotLeft;

  const clamped = Math.min(window.closeMinutes, Math.max(window.openMinutes, minutesLocal));
  return plotLeft + ((clamped - window.openMinutes) / span) * plotWidth;
}

export type SessionXTick = Readonly<{
  x: number;
  label: string;
  textAnchor: "start" | "middle" | "end";
  key: string;
}>;

/** Open, mid-session, and close ticks on the fixed 1D session axis. */
export function buildSessionXTicks(
  window: SessionWindow,
  plotLeft: number,
  plotWidth: number,
): SessionXTick[] {
  const midMinutes = Math.round((window.openMinutes + window.closeMinutes) / 2);
  const specs = [
    { minutes: window.openMinutes, textAnchor: "start" as const, key: "open" },
    { minutes: midMinutes, textAnchor: "middle" as const, key: "mid" },
    { minutes: window.closeMinutes, textAnchor: "end" as const, key: "close" },
  ];

  return specs.map(({ minutes, textAnchor, key }) => ({
    key,
    textAnchor,
    label: fmtSessionClock(minutes),
    x: mapSessionX(minutes, window, plotLeft, plotWidth),
  }));
}
