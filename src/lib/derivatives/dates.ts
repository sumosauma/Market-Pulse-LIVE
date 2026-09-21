/** Count Mon–Fri sessions after `fromIso` through `toIso` (UTC calendar dates). Holidays are not excluded. */
export function weekdayCountExclusiveStart(fromIso: string, toIso: string): number {
  const from = parseUtcDate(fromIso);
  const to = parseUtcDate(toIso);
  if (!from || !to || to <= from) return 0;

  let n = 0;
  const cur = new Date(from);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= to) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

export function parseUtcDate(isoDate: string): Date | null {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function addUtcDays(isoDate: string, days: number): string | null {
  const dt = parseUtcDate(isoDate);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isoToYyyymmdd(isoDate: string): number | null {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Number(`${m[1]}${m[2]}${m[3]}`);
}

export function yyyymmddToIso(value: number): string | null {
  const s = String(value);
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return parseUtcDate(iso) ? iso : null;
}

/** Third Friday of a UTC calendar month (OMXS30 monthly options expiry). `month` is 1–12. */
export function thirdFridayUtc(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dow = first.getUTCDay();
  const firstFriday = 1 + ((5 - dow + 7) % 7);
  const third = firstFriday + 14;
  const dt = new Date(Date.UTC(year, month - 1, third));
  return dt.toISOString().slice(0, 10);
}
