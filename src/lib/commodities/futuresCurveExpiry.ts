/**
 * CME/COMEX/CBOT last-trade (termination) dates for the futures strip.
 * Used so Daily Bulletin rows (which lack reliable vol/OI) do not keep expired fronts.
 *
 * Rules follow exchange contract specs (NYMEX CL/BZ/NG/TTF, COMEX metals, CBOT grains).
 * US business days use the NYSE holiday calendar already maintained in marketHours.
 * UK business days use weekends + a small fixed bank-holiday set (Brent/TTF London legs).
 */

import { __marketHoursTest } from "@/lib/markets/marketHours";

const NYSE_CALENDARS = __marketHoursTest.NYSE_CALENDARS;

/** Major UK bank holidays that affect ICE Brent / London TTF scheduling (2025–2027). */
const UK_BANK_HOLIDAYS = new Set([
  "2025-01-01",
  "2025-04-18",
  "2025-04-21",
  "2025-05-05",
  "2025-05-26",
  "2025-08-25",
  "2025-12-25",
  "2025-12-26",
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  "2027-01-01",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

function isoFromParts(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

function weekdayUtc(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function isUsExchangeHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  const cal = NYSE_CALENDARS[year];
  return Boolean(cal?.closed.has(iso));
}

function isUsBusinessDay(iso: string): boolean {
  const day = weekdayUtc(iso);
  if (day === 0 || day === 6) return false;
  return !isUsExchangeHoliday(iso);
}

function isUkBusinessDay(iso: string): boolean {
  const day = weekdayUtc(iso);
  if (day === 0 || day === 6) return false;
  return !UK_BANK_HOLIDAYS.has(iso);
}

/** Walk back `count` US business days strictly before `iso` (exclusive). */
function priorUsBusinessDays(iso: string, count: number): string {
  let cursor = iso;
  let found = 0;
  let guard = 0;
  while (found < count && guard < count + 40) {
    cursor = addCalendarDaysIso(cursor, -1);
    if (isUsBusinessDay(cursor)) found += 1;
    guard += 1;
  }
  return cursor;
}

/** Last US business day on or before `iso`. */
function lastUsBusinessDayOnOrBefore(iso: string): string {
  let cursor = iso;
  let guard = 0;
  while (!isUsBusinessDay(cursor) && guard < 20) {
    cursor = addCalendarDaysIso(cursor, -1);
    guard += 1;
  }
  return cursor;
}

/** Last UK business day on or before `iso`. */
function lastUkBusinessDayOnOrBefore(iso: string): string {
  let cursor = iso;
  let guard = 0;
  while (!isUkBusinessDay(cursor) && guard < 20) {
    cursor = addCalendarDaysIso(cursor, -1);
    guard += 1;
  }
  return cursor;
}

/** Walk back `count` UK business days strictly before `iso` (exclusive). */
function priorUkBusinessDays(iso: string, count: number): string {
  let cursor = iso;
  let found = 0;
  let guard = 0;
  while (found < count && guard < count + 40) {
    cursor = addCalendarDaysIso(cursor, -1);
    if (isUkBusinessDay(cursor)) found += 1;
    guard += 1;
  }
  return cursor;
}

/** Last calendar day of a month as ISO. */
function lastDayOfMonthIso(year: number, monthIndex: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return isoFromParts(year, monthIndex, last);
}

/**
 * NYMEX CL (WTI): 3 US business days prior to the 25th of the month preceding delivery.
 * If the 25th is not a business day: 3 BD prior to the last BD preceding the 25th.
 */
export function lastTradeDateCl(year: number, monthIndex: number): string {
  let priorYear = year;
  let priorMonth = monthIndex - 1;
  if (priorMonth < 0) {
    priorMonth = 11;
    priorYear -= 1;
  }
  const twentyFifth = isoFromParts(priorYear, priorMonth, 25);
  if (isUsBusinessDay(twentyFifth)) {
    return priorUsBusinessDays(twentyFifth, 3);
  }
  const lastBdBefore = lastUsBusinessDayOnOrBefore(addCalendarDaysIso(twentyFifth, -1));
  return priorUsBusinessDays(lastBdBefore, 3);
}

/**
 * NYMEX BZ (Brent last-day): last UK business day of the second month preceding the contract month
 * (except the UK BD preceding New Year’s Day → second UK BD preceding New Year’s Day).
 */
export function lastTradeDateBz(year: number, monthIndex: number): string {
  let y = year;
  let m = monthIndex - 2;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  const end = lastDayOfMonthIso(y, m);
  let ltd = lastUkBusinessDayOnOrBefore(end);
  // New Year exception (BZ): when second-preceding month is December, if the natural LTD
  // is the UK business day preceding New Year’s Day, use the second UK BD before Jan 1.
  if (m === 11) {
    const newYears = `${y + 1}-01-01`;
    const firstPreceding = priorUkBusinessDays(newYears, 1);
    if (ltd === firstPreceding) {
      ltd = priorUkBusinessDays(newYears, 2);
    }
  }
  return ltd;
}

/** NYMEX NG: trading ceases on the 3rd US business day prior to the contract month. */
export function lastTradeDateNg(year: number, monthIndex: number): string {
  const firstOfContract = isoFromParts(year, monthIndex, 1);
  return priorUsBusinessDays(firstOfContract, 3);
}

/**
 * NYMEX TTF calendar month: 2nd London business day preceding the 1st of the contract month,
 * adjusted to also be a NYMEX (US) business day.
 */
export function lastTradeDateTtf(year: number, monthIndex: number): string {
  const firstOfContract = isoFromParts(year, monthIndex, 1);
  let cursor = priorUkBusinessDays(firstOfContract, 2);
  let guard = 0;
  while ((!isUsBusinessDay(cursor) || !isUkBusinessDay(cursor)) && guard < 20) {
    cursor = addCalendarDaysIso(cursor, -1);
    guard += 1;
  }
  return cursor;
}

/** COMEX GC/SI/HG/ALI: third last business day of the delivery month. */
export function lastTradeDateComexMetal(year: number, monthIndex: number): string {
  const end = lastDayOfMonthIso(year, monthIndex);
  // nth last = walk back counting business days inclusive of end if it is a BD
  let cursor = end;
  let found = 0;
  let guard = 0;
  while (guard < 40) {
    if (isUsBusinessDay(cursor)) {
      found += 1;
      if (found === 3) return cursor;
    }
    cursor = addCalendarDaysIso(cursor, -1);
    guard += 1;
  }
  return end;
}

/** CBOT grains (ZW/ZC): business day prior to the 15th calendar day of the contract month. */
export function lastTradeDateGrain(year: number, monthIndex: number): string {
  const fifteenth = isoFromParts(year, monthIndex, 15);
  return priorUsBusinessDays(fifteenth, 1);
}

export function lastTradeDateForCurve(
  curveId: string,
  year: number,
  monthIndex: number,
): string | null {
  switch (curveId) {
    case "wti":
      return lastTradeDateCl(year, monthIndex);
    case "brent":
      return lastTradeDateBz(year, monthIndex);
    case "henry-hub":
      return lastTradeDateNg(year, monthIndex);
    case "ttf":
      return lastTradeDateTtf(year, monthIndex);
    case "gold":
    case "silver":
    case "copper":
    case "aluminium":
      return lastTradeDateComexMetal(year, monthIndex);
    case "wheat":
    case "corn":
      return lastTradeDateGrain(year, monthIndex);
    default:
      return null;
  }
}

/**
 * Keep a delivery month when the settlement session is on or before its last trade date.
 * Unknown products are kept (caller still applies strip/cycle filters).
 */
export function isFuturesContractActiveOnSession(
  curveId: string,
  year: number,
  monthIndex: number,
  sessionDate: string,
): boolean {
  const ltd = lastTradeDateForCurve(curveId, year, monthIndex);
  if (!ltd) return true;
  return sessionDate <= ltd;
}
