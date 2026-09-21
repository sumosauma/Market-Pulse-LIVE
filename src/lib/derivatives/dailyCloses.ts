import type { DailyClose } from "./realizedVol";

const FETCH_TIMEOUT_MS = 8_000;

type YahooChartJson = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string };
  };
};

/** ~2y of daily closes: 21 for current RV20 plus ~252 historical RV20 observations. */
const YAHOO_DAILY_RANGE = "2y";
/** FRED business-day SP500: enough for 21 + ~252 RV20 windows. */
const FRED_DAILY_LIMIT = 400;

export async function fetchYahooDailyCloses(ticker: string): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${YAHOO_DAILY_RANGE}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = (await res.json()) as YahooChartJson;
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(json.chart?.error?.description ?? "No chart data");

  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: DailyClose[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      points.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), close });
    }
  }
  if (points.length < 21) throw new Error(`Yahoo ${ticker} returned ${points.length} daily closes`);
  return points;
}

export async function fetchFredDailyCloses(seriesId: string): Promise<DailyClose[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=${FRED_DAILY_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
  const points = (json.observations ?? [])
    .map((o) => ({ date: o.date, close: parseFloat(o.value) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .reverse();
  if (points.length < 21) throw new Error(`FRED ${seriesId} returned ${points.length} daily closes`);
  return points;
}
