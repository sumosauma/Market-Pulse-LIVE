/** Norges Bank SDMX REST helpers — Yield Curves module only. */

const LOG = "[NO_CURVE][NorgesBank]";
const API_BASE = "https://data.norges-bank.no/api/data";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type NorgesBankObservationRow = Readonly<{ date: string; value: number }>;

export type NorgesBankSeriesFetchResult =
  | Readonly<{
      ok: true;
      datasetId: string;
      seriesKey: string;
      url: string;
      rows: NorgesBankObservationRow[];
    }>
  | Readonly<{
      ok: false;
      datasetId: string;
      seriesKey: string;
      url: string;
      error: string;
      httpStatus?: number;
    }>;

export function buildNorgesBankDataUrl(
  datasetId: string,
  seriesKey: string,
  startDateIso: string,
  endDateIso: string,
): string {
  const keyPath = seriesKey ? `${seriesKey}/` : "";
  return `${API_BASE}/${datasetId}/${keyPath}?format=sdmx-json&startPeriod=${startDateIso}&endPeriod=${endDateIso}`;
}

type SdmxTimeValue = { id?: string };
type SdmxSeriesEntry = { observations?: Record<string, string[]> };

/** Parse daily observations from Norges Bank SDMX-JSON (business-day dates only). */
export function parseNorgesBankSdmxDailyObservations(payload: unknown): NorgesBankObservationRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as {
    data?: {
      dataSets?: Array<{ series?: Record<string, SdmxSeriesEntry> }>;
      structure?: {
        dimensions?: {
          observation?: Array<{ id: string; values?: SdmxTimeValue[] }>;
        };
      };
    };
  };

  const timeDim = root.data?.structure?.dimensions?.observation?.find((d) => d.id === "TIME_PERIOD");
  const timeValues = timeDim?.values ?? [];
  const seriesMap = root.data?.dataSets?.[0]?.series;
  if (!seriesMap) return [];

  const byDate = new Map<string, number>();

  for (const series of Object.values(seriesMap)) {
    const obs = series.observations ?? {};
    for (const [idxStr, valArr] of Object.entries(obs)) {
      const idx = Number(idxStr);
      const period = timeValues[idx];
      const dateId = period?.id;
      if (!dateId || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) continue;
      const raw = valArr[0];
      const value = typeof raw === "string" ? parseFloat(raw) : Number(raw);
      if (!Number.isFinite(value)) continue;
      byDate.set(dateId, value);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function fetchNorgesBankHttp(url: string, label: string): Promise<Response> {
  const headers = { Accept: "application/json", "User-Agent": UA } as const;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await timedFetch(url, { headers });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) return res;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  throw new Error(`Norges Bank fetch exhausted retries (${label})`);
}

/** Fetch one official series — never throws. */
export async function fetchNorgesBankSeriesObservationsSafe(
  datasetId: string,
  seriesKey: string,
  startDateIso: string,
  endDateIso: string,
): Promise<NorgesBankSeriesFetchResult> {
  const url = buildNorgesBankDataUrl(datasetId, seriesKey, startDateIso, endDateIso);

  try {
    const res = await fetchNorgesBankHttp(url, `${datasetId}/${seriesKey}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`${LOG}[${datasetId}/${seriesKey}] HTTP ${res.status} body=${body.slice(0, 200)}`);
      return {
        ok: false,
        datasetId,
        seriesKey,
        url,
        error: `HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }

    const jsonUnknown: unknown = await res.json();
    const rows = parseNorgesBankSdmxDailyObservations(jsonUnknown);
    if (!rows.length) {
      return { ok: false, datasetId, seriesKey, url, error: "empty observations" };
    }

    return { ok: true, datasetId, seriesKey, url, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, datasetId, seriesKey, url, error: msg };
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
