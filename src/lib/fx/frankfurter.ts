import type { FxPoint } from "./types";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

type LatestResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

type TimeseriesResponse = {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
};

async function frankfurterGet<T>(path: string, label: string): Promise<T> {
  const url = `${FRANKFURTER_BASE}${path}`;
  console.log(`[FX][frankfurter] GET ${label} ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const json = (await res.json()) as T & { message?: string };
    if (!res.ok) {
      const detail = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
      throw new Error(`Frankfurter ${label}: ${detail.slice(0, 180)}`);
    }
    return json;
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) {
      throw new Error(`Frankfurter ${label}: request timed out`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchLatest(
  base: string,
  symbols: readonly string[],
): Promise<LatestResponse> {
  const qs = new URLSearchParams({ base, symbols: symbols.join(",") });
  return frankfurterGet<LatestResponse>(`/latest?${qs}`, `latest ${base}`);
}

export async function fetchTimeseries(
  from: string,
  to: string,
  base: string,
  symbols: readonly string[],
): Promise<TimeseriesResponse> {
  const qs = new URLSearchParams({ base, symbols: symbols.join(",") });
  return frankfurterGet<TimeseriesResponse>(`/${from}..${to}?${qs}`, `range ${base} ${from}..${to}`);
}

export function pointsFromTimeseries(
  series: TimeseriesResponse,
  symbol: string,
): FxPoint[] {
  const points: FxPoint[] = [];
  for (const [date, bag] of Object.entries(series.rates ?? {})) {
    const close = bag?.[symbol];
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof close === "number" && Number.isFinite(close)) {
      points.push({ date, close });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}
