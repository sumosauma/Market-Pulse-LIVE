/** DI (Millistream) Swedish rate history via di.se instrument-history API. */

const UA = "Mozilla/5.0 (compatible; MarketPulse/1.0)";

export type DiObservationRow = Readonly<{ date: string; value: number }>;

export type DiHistoryPayload = Readonly<{
  name: string;
  points: ReadonlyArray<readonly [number, number]>;
}>;

export const DI_SWEDEN_MARKETS_INSREF = {
  SEGVB2YC: "33381",
  SEGVB10YC: "33383",
} as const;

export type DiSwedenMarketsSymbol = keyof typeof DI_SWEDEN_MARKETS_INSREF;

export function diHistoryUrl(insref: string): string {
  return `https://www.di.se/market/instrument-history/${insref}/`;
}

export function msToUtcDateIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Last intraday observation per UTC calendar day. */
export function normalizeDiPointsToDailyEod(
  points: ReadonlyArray<readonly [number, number]>,
): DiObservationRow[] {
  const lastByDay = new Map<string, DiObservationRow>();
  for (const [ts, value] of points) {
    if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;
    const date = msToUtcDateIso(ts);
    lastByDay.set(date, { date, value });
  }
  return [...lastByDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function trimRowsToLookback(rows: readonly DiObservationRow[], maxCalendarDays: number): DiObservationRow[] {
  if (rows.length <= maxCalendarDays) return [...rows];
  return rows.slice(-maxCalendarDays);
}

export async function fetchDiInstrumentHistory(insref: string): Promise<DiHistoryPayload> {
  const res = await fetch(diHistoryUrl(insref), {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`DI history HTTP ${res.status} (insref ${insref})`);

  const json = (await res.json()) as { name?: string; points?: unknown };
  if (!Array.isArray(json.points) || json.points.length === 0) {
    throw new Error(`DI history empty (insref ${insref})`);
  }

  const points = json.points.filter(
    (p): p is [number, number] =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === "number" &&
      typeof p[1] === "number" &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );
  if (!points.length) throw new Error(`DI history had no valid points (insref ${insref})`);

  return { name: json.name ?? insref, points };
}
