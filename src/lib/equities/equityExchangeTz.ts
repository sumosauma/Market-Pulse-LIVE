/** Exchange timezone context from Yahoo chart meta. */
export type ExchangeTz = Readonly<{
  exchangeTimezoneName?: string | null;
  gmtoffset?: number | null;
  timezone?: string | null;
}>;

/** Yahoo sometimes returns wrong IANA zones — override for local session/status/chart time. */
const EXCHANGE_TZ_BY_TICKER: Record<string, string> = {
  "^OMXC25": "Europe/Copenhagen",
  "^OMXH25": "Europe/Helsinki",
  "^NQZA": "Africa/Johannesburg",
};

export function exchangeTimezoneOverrideForTicker(ticker?: string | null): string | null {
  if (!ticker) return null;
  return EXCHANGE_TZ_BY_TICKER[ticker] ?? null;
}

function parseInstant(iso: string): Date {
  return new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
}

/** Exchange-local calendar date (YYYY-MM-DD) for session grouping. */
export function exchangeLocalDateKey(iso: string, tz: ExchangeTz): string {
  const d = parseInstant(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);

  if (tz.exchangeTimezoneName) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz.exchangeTimezoneName }).format(d);
    } catch {
      // Invalid IANA name — fall through to gmtoffset / UTC.
    }
  }

  if (tz.gmtoffset != null && Number.isFinite(tz.gmtoffset)) {
    const shifted = new Date(d.getTime() + tz.gmtoffset * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const day = String(shifted.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Legacy UTC fallback when exchange metadata is missing.
  return d.toISOString().slice(0, 10);
}

/** Format a time label in the exchange timezone (1D chart). */
export function fmtExchangeTime(iso: string, tz: ExchangeTz): string {
  const d = parseInstant(iso);
  if (Number.isNaN(d.getTime())) return iso;

  if (tz.exchangeTimezoneName) {
    try {
      return d.toLocaleTimeString("en-US", {
        timeZone: tz.exchangeTimezoneName,
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      // fall through
    }
  }

  if (tz.gmtoffset != null && Number.isFinite(tz.gmtoffset)) {
    const shifted = new Date(d.getTime() + tz.gmtoffset * 1000);
    return shifted.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }

  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function exchangeTzFromRow(row: {
  ticker?: string | null;
  exchangeTimezoneName?: string | null;
  gmtoffset?: number | null;
  timezone?: string | null;
}): ExchangeTz {
  const override = exchangeTimezoneOverrideForTicker(row.ticker);
  if (override) {
    return { exchangeTimezoneName: override, gmtoffset: null, timezone: null };
  }
  return {
    exchangeTimezoneName: row.exchangeTimezoneName ?? null,
    gmtoffset: row.gmtoffset ?? null,
    timezone: row.timezone ?? null,
  };
}

/** Exchange-local minutes from midnight for session x-positioning. */
export function exchangeLocalMinutesSinceMidnight(iso: string, tz: ExchangeTz): number | null {
  const d = parseInstant(iso);
  if (Number.isNaN(d.getTime())) return null;

  if (tz.exchangeTimezoneName) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz.exchangeTimezoneName,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(d);
      const hour = Number(parts.find((p) => p.type === "hour")?.value);
      const minute = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(hour) && Number.isFinite(minute)) return hour * 60 + minute;
    } catch {
      // fall through
    }
  }

  if (tz.gmtoffset != null && Number.isFinite(tz.gmtoffset)) {
    const shifted = new Date(d.getTime() + tz.gmtoffset * 1000);
    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  }

  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Exchange-local weekday: 0 = Sunday … 6 = Saturday. */
export function exchangeLocalWeekday(iso: string, tz: ExchangeTz): number | null {
  const d = parseInstant(iso);
  if (Number.isNaN(d.getTime())) return null;

  if (tz.exchangeTimezoneName) {
    try {
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: tz.exchangeTimezoneName,
        weekday: "short",
      }).format(d);
      const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      return map[weekday] ?? null;
    } catch {
      // fall through
    }
  }

  if (tz.gmtoffset != null && Number.isFinite(tz.gmtoffset)) {
    const shifted = new Date(d.getTime() + tz.gmtoffset * 1000);
    return shifted.getUTCDay();
  }

  return d.getUTCDay();
}

