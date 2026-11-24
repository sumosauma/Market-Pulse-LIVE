/**
 * Live cash-equity session status for Nasdaq Stockholm (XSTO) and NYSE/Nasdaq US.
 * Calendars are exchange-published holidays + early closes (not weekday heuristics alone).
 * Outside covered years, next open/close times are withheld.
 */

export type MarketId = "se" | "us";

export type MarketHoursStatus = {
  id: MarketId;
  code: string;
  exchangeName: string;
  timeZone: string;
  /** Regular local session description for tooltips. */
  regularHoursLocal: string;
  isOpen: boolean;
  /** False when the calendar does not cover this date — do not invent open/close times. */
  calendarKnown: boolean;
  /** Stockholm-wall next boundary label, e.g. "Closes 17:30" or "Opens 15:30". */
  nextLabel: string | null;
  /** Tooltip line for the upcoming boundary. */
  nextDetail: string | null;
};

const DISPLAY_TZ = "Europe/Stockholm";

const STO_TZ = "Europe/Stockholm";
const US_TZ = "America/New_York";

type DayKind = "closed" | "regular" | "early";

/** YYYY-MM-DD → closed | early (half day). Regular weekdays omit the key. */
type YearCalendar = Readonly<{
  closed: ReadonlySet<string>;
  early: ReadonlySet<string>;
}>;

const STO_OPEN = { hour: 9, minute: 0 };
const STO_CLOSE = { hour: 17, minute: 30 };
const STO_EARLY_CLOSE = { hour: 13, minute: 0 };

const US_OPEN = { hour: 9, minute: 30 };
const US_CLOSE = { hour: 16, minute: 0 };
const US_EARLY_CLOSE = { hour: 13, minute: 0 };

/** Official Nasdaq Stockholm equity holiday / half-day calendars. */
const XSTO_CALENDARS: Record<number, YearCalendar> = {
  2025: {
    closed: new Set([
      "2025-01-01",
      "2025-01-06",
      "2025-04-18",
      "2025-04-21",
      "2025-05-01",
      "2025-05-29",
      "2025-06-06",
      "2025-06-20",
      "2025-12-24",
      "2025-12-25",
      "2025-12-26",
      "2025-12-31",
    ]),
    early: new Set(["2025-04-17", "2025-04-30", "2025-05-28", "2025-10-31"]),
  },
  2026: {
    closed: new Set([
      "2026-01-01",
      "2026-01-06",
      "2026-04-03",
      "2026-04-06",
      "2026-05-01",
      "2026-05-14",
      "2026-06-19",
      "2026-12-24",
      "2026-12-25",
      "2026-12-31",
    ]),
    early: new Set(["2026-01-05", "2026-04-02", "2026-04-30", "2026-05-13", "2026-10-30"]),
  },
  2027: {
    closed: new Set([
      "2027-01-01",
      "2027-01-06",
      "2027-03-26",
      "2027-03-29",
      "2027-05-06",
      "2027-06-25",
      "2027-12-24",
      "2027-12-31",
    ]),
    early: new Set(["2027-01-05", "2027-03-25", "2027-04-30", "2027-05-05", "2027-11-05"]),
  },
};

/** NYSE Group cash equity holidays / early closes (applies to NYSE + Nasdaq US equities). */
const NYSE_CALENDARS: Record<number, YearCalendar> = {
  2025: {
    closed: new Set([
      "2025-01-01",
      "2025-01-20",
      "2025-02-17",
      "2025-04-18",
      "2025-05-26",
      "2025-06-19",
      "2025-07-04",
      "2025-09-01",
      "2025-11-27",
      "2025-12-25",
    ]),
    early: new Set(["2025-07-03", "2025-11-28", "2025-12-24"]),
  },
  2026: {
    closed: new Set([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ]),
    early: new Set(["2026-11-27", "2026-12-24"]),
  },
  2027: {
    closed: new Set([
      "2027-01-01",
      "2027-01-18",
      "2027-02-15",
      "2027-03-26",
      "2027-05-31",
      "2027-06-18",
      "2027-07-05",
      "2027-09-06",
      "2027-11-25",
      "2027-12-24",
    ]),
    early: new Set(["2027-11-26"]),
  },
};

type VenueConfig = {
  id: MarketId;
  code: string;
  exchangeName: string;
  timeZone: string;
  regularHoursLocal: string;
  calendars: Record<number, YearCalendar>;
  open: { hour: number; minute: number };
  close: { hour: number; minute: number };
  earlyClose: { hour: number; minute: number };
};

const VENUES: readonly VenueConfig[] = [
  {
    id: "se",
    code: "SE",
    exchangeName: "Nasdaq Stockholm",
    timeZone: STO_TZ,
    regularHoursLocal: "09:00–17:30",
    calendars: XSTO_CALENDARS,
    open: STO_OPEN,
    close: STO_CLOSE,
    earlyClose: STO_EARLY_CLOSE,
  },
  {
    id: "us",
    code: "US",
    exchangeName: "NYSE / Nasdaq US",
    timeZone: US_TZ,
    regularHoursLocal: "09:30–16:00",
    calendars: NYSE_CALENDARS,
    open: US_OPEN,
    close: US_CLOSE,
    earlyClose: US_EARLY_CLOSE,
  },
];

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun … 6=Sat
  dateKey: string;
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return {
    year,
    month,
    day,
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: weekdayMap[bag.weekday ?? ""] ?? 0,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date (DST-safe iterative). */
function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - asIfUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

function addCalendarDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function dayKind(venue: VenueConfig, dateKey: string, weekday: number): DayKind | "unknown" {
  const year = Number(dateKey.slice(0, 4));
  const cal = venue.calendars[year];
  if (!cal) return "unknown";
  if (weekday === 0 || weekday === 6) return "closed";
  if (cal.closed.has(dateKey)) return "closed";
  if (cal.early.has(dateKey)) return "early";
  return "regular";
}

function weekdayForDateKey(dateKey: string, timeZone: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  // Noon local avoids DST edge ambiguity when resolving weekday.
  return zonedParts(zonedWallToUtc(year, month, day, 12, 0, timeZone), timeZone).weekday;
}

function sessionBounds(
  venue: VenueConfig,
  dateKey: string,
  kind: "regular" | "early",
): { openAt: Date; closeAt: Date } {
  const { year, month, day } = parseDateKey(dateKey);
  const openAt = zonedWallToUtc(year, month, day, venue.open.hour, venue.open.minute, venue.timeZone);
  const closeClock = kind === "early" ? venue.earlyClose : venue.close;
  const closeAt = zonedWallToUtc(year, month, day, closeClock.hour, closeClock.minute, venue.timeZone);
  return { openAt, closeAt };
}

function formatHm(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatWeekdayShort(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(date);
}

function findNextOpen(
  venue: VenueConfig,
  fromDateKey: string,
  afterMs: number,
): { at: Date; dateKey: string } | null {
  for (let i = 0; i < 21; i++) {
    const dateKey = addCalendarDays(fromDateKey, i);
    const year = Number(dateKey.slice(0, 4));
    if (!venue.calendars[year]) return null;
    const weekday = weekdayForDateKey(dateKey, venue.timeZone);
    const kind = dayKind(venue, dateKey, weekday);
    if (kind === "unknown") return null;
    if (kind === "closed") continue;
    const { openAt } = sessionBounds(venue, dateKey, kind);
    if (openAt.getTime() > afterMs) return { at: openAt, dateKey };
  }
  return null;
}

function statusForVenue(venue: VenueConfig, now: Date): MarketHoursStatus {
  const local = zonedParts(now, venue.timeZone);
  const kind = dayKind(venue, local.dateKey, local.weekday);

  const base = {
    id: venue.id,
    code: venue.code,
    exchangeName: venue.exchangeName,
    timeZone: venue.timeZone,
    regularHoursLocal: venue.regularHoursLocal,
  } as const;

  if (kind === "unknown") {
    return {
      ...base,
      isOpen: false,
      calendarKnown: false,
      nextLabel: null,
      nextDetail: null,
    };
  }

  if (kind === "regular" || kind === "early") {
    const { openAt, closeAt } = sessionBounds(venue, local.dateKey, kind);
    const t = now.getTime();

    if (t >= openAt.getTime() && t < closeAt.getTime()) {
      const closeHm = formatHm(closeAt, DISPLAY_TZ);
      return {
        ...base,
        isOpen: true,
        calendarKnown: true,
        nextLabel: `Closes ${closeHm}`,
        nextDetail: `Closes today ${closeHm} (${DISPLAY_TZ})`,
      };
    }

    if (t < openAt.getTime()) {
      const openHm = formatHm(openAt, DISPLAY_TZ);
      return {
        ...base,
        isOpen: false,
        calendarKnown: true,
        nextLabel: `Opens ${openHm}`,
        nextDetail: `Opens today ${openHm} (${DISPLAY_TZ})`,
      };
    }
  }

  const next = findNextOpen(venue, local.dateKey, now.getTime());
  if (!next) {
    return {
      ...base,
      isOpen: false,
      calendarKnown: false,
      nextLabel: null,
      nextDetail: null,
    };
  }

  const openHm = formatHm(next.at, DISPLAY_TZ);
  const sameLocalDay = zonedParts(next.at, venue.timeZone).dateKey === local.dateKey;
  const displayDay = sameLocalDay ? "today" : formatWeekdayShort(next.at, DISPLAY_TZ);
  return {
    ...base,
    isOpen: false,
    calendarKnown: true,
    nextLabel: `Opens ${openHm}`,
    nextDetail: `Opens ${displayDay} ${openHm} (${DISPLAY_TZ})`,
  };
}

export function getMarketHoursStatuses(now = new Date()): MarketHoursStatus[] {
  return VENUES.map((venue) => statusForVenue(venue, now));
}

/** ms until the nearer of next open/close across venues (for snappy UI updates). */
export function msUntilNextMarketBoundary(now = new Date()): number | null {
  let soonest: number | null = null;
  for (const venue of VENUES) {
    const local = zonedParts(now, venue.timeZone);
    const kind = dayKind(venue, local.dateKey, local.weekday);
    if (kind === "regular" || kind === "early") {
      const { openAt, closeAt } = sessionBounds(venue, local.dateKey, kind);
      for (const edge of [openAt.getTime(), closeAt.getTime()]) {
        const delta = edge - now.getTime();
        if (delta > 0 && (soonest == null || delta < soonest)) soonest = delta;
      }
    }
    const next = findNextOpen(venue, local.dateKey, now.getTime());
    if (next) {
      const delta = next.at.getTime() - now.getTime();
      if (delta > 0 && (soonest == null || delta < soonest)) soonest = delta;
    }
  }
  return soonest;
}

/** Test helpers */
export const __marketHoursTest = {
  zonedParts,
  zonedWallToUtc,
  dayKind,
  statusForVenue,
  VENUES,
  XSTO_CALENDARS,
  NYSE_CALENDARS,
};
