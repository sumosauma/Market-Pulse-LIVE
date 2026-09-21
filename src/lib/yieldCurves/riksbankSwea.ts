/** Riksbank SWEA REST helpers — Yield Curves module only (isolated from market overview). */

const LOG = "[SE_CURVE][Riksbank]";
const FETCH_TIMEOUT_MS = 18_000;
const MAX_ATTEMPTS = 3;
/** SWEA may ask for 50s+ backoff; cap wait so server handlers finish in time. */
const MAX_429_WAIT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type RiksbankObservationRow = Readonly<{ date: string; value: number }>;

export type RiksbankSeriesFetchResult =
  | Readonly<{ ok: true; seriesId: string; url: string; rows: RiksbankObservationRow[] }>
  | Readonly<{ ok: false; seriesId: string; url: string; error: string; httpStatus?: number }>;

function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

export function buildRiksbankObservationsUrl(
  seriesId: string,
  startDateIso: string,
  endDateIso: string,
): string {
  return `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${startDateIso}/${endDateIso}`;
}

function parse429WaitMs(body: string, attempt: number): number {
  const m = /try again in (\d+) seconds?/i.exec(body);
  if (m?.[1]) return Math.min(MAX_429_WAIT_MS, (Number(m[1]) + 1) * 1000);
  return Math.min(MAX_429_WAIT_MS, 2000 + attempt * 2000);
}

/** SWEA may return an array directly or wrap rows; field names vary by serializer. */
export function normalizeRiksbankObservationRows(payload: unknown): Array<{ date: string; value: number | string }> {
  const tryCoerceRow = (o: unknown): { date: string; value: number | string } | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const date = r.date ?? r.Datum ?? r.dtm ?? r.Date ?? r.CalendarDay ?? r.businessDate;
    const rawVal =
      r.value ?? r.Value ?? r.rate ?? r.Rate ?? r.observation ?? r.observationValue ?? r.observation_value;
    const value =
      typeof rawVal === "object" &&
      rawVal &&
      typeof (rawVal as Record<string, unknown>).value !== "undefined"
        ? ((rawVal as Record<string, unknown>).value as number | string)
        : (rawVal as number | string | undefined);
    if (typeof date !== "string" || date.length < 8) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    return { date, value };
  };

  if (Array.isArray(payload)) {
    return payload.map(tryCoerceRow).filter((x): x is NonNullable<typeof x> => x !== null);
  }
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const inner =
      p.observations ??
      p.Observations ??
      p.observation ??
      p.data ??
      p.Data ??
      p.values ??
      p.Values ??
      p.items ??
      p.Items;
    if (Array.isArray(inner)) {
      return inner.map(tryCoerceRow).filter((x): x is NonNullable<typeof x> => x !== null);
    }
  }
  return [];
}

function rowsFromPayload(seriesId: string, payload: unknown): RiksbankObservationRow[] {
  const normalized = normalizeRiksbankObservationRows(payload);
  const rows: RiksbankObservationRow[] = normalized
    .map((o) => ({
      date: o.date.slice(0, 10),
      value: typeof o.value === "number" ? o.value : parseFloat(String(o.value)),
    }))
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return rows;
}

async function fetchRiksbankHttp(url: string, seriesId: string): Promise<Response> {
  const headers = { Accept: "application/json", "User-Agent": UA } as const;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await timedFetch(url, { headers });
      if (res.ok) return res;

      const retryable = res.status === 403 || res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) return res;

      const body = await res.text().catch(() => "");
      const waitMs = res.status === 429 ? parse429WaitMs(body, attempt) : 800 * attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  throw new Error(`Riksbank fetch exhausted retries (${seriesId})`);
}

/** Fetch one SWEA series — never throws; returns ok/error result. */
export async function fetchRiksbankSeriesObservationsSafe(
  seriesId: string,
  startDateIso: string,
  endDateIso: string,
): Promise<RiksbankSeriesFetchResult> {
  const url = buildRiksbankObservationsUrl(seriesId, startDateIso, endDateIso);

  try {
    const res = await fetchRiksbankHttp(url, seriesId);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`${LOG}[${seriesId}] HTTP ${res.status} url=${url} body=${body.slice(0, 200)}`);
      return {
        ok: false,
        seriesId,
        url,
        error: `HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }

    if (res.status === 204) {
      return { ok: false, seriesId, url, error: "empty observations", httpStatus: 204 };
    }

    const jsonUnknown: unknown = await res.json();
    const rows = rowsFromPayload(seriesId, jsonUnknown);
    if (!rows.length) {
      return { ok: false, seriesId, url, error: "empty observations" };
    }

    return { ok: true, seriesId, url, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, seriesId, url, error: msg };
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
