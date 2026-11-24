import type { HistoryPoint } from "./indicators";
import { utcDateDaysFromToday } from "./overview";
import {
  SECTOR_PROVIDERS,
  SECTOR_PROVIDER_SPECS,
  computeProviderPerformance,
  type Distribution,
  type FundSeries,
  type ProviderPerformance,
  type SectorFund,
  type SectorPerformance,
  type SectorProviderSpec,
} from "./sectorPerformance";

const FETCH_TIMEOUT_MS = 12_000;

type Period = { start?: number; end?: number };

type FundFetch = {
  series: FundSeries;
  regular: Period | null;
  regularMarketTime: number | null;
};

function sessionDate(ts: number, gmtoffset: number): string {
  return new Date((ts + gmtoffset) * 1000).toISOString().slice(0, 10);
}

async function fetchFund(fund: SectorFund, spec: SectorProviderSpec): Promise<FundFetch | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fund.symbol)}?interval=1d&range=2y&events=div`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> };
        events?: { dividends?: Record<string, { amount?: number; date?: number }> };
        meta?: {
          symbol?: string;
          currency?: string;
          instrumentType?: string;
          exchangeTimezoneName?: string;
          gmtoffset?: number;
          regularMarketTime?: number;
          currentTradingPeriod?: { regular?: Period };
        };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  if (
    !result ||
    !meta ||
    meta.symbol !== fund.symbol ||
    meta.instrumentType !== spec.instrumentType ||
    meta.currency !== spec.currency ||
    meta.exchangeTimezoneName !== spec.exchangeTimezone ||
    typeof meta.gmtoffset !== "number"
  ) {
    return null;
  }
  const offset = meta.gmtoffset;
  const timestamps = result.timestamp ?? [];
  // Yahoo's `close` is split-adjusted only; distributions are not reinvested.
  const quote = result.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];
  const points: HistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    const ts = timestamps[i];
    if (spec.skipZeroVolume && volumes[i] === 0) continue;
    if (typeof close === "number" && close > 0 && typeof ts === "number") {
      points.push({ date: sessionDate(ts, offset), close });
    }
  }
  const distributions: Distribution[] = Object.values(result.events?.dividends ?? {})
    .filter((row): row is { amount: number; date: number } => typeof row.amount === "number" && typeof row.date === "number")
    .map((row) => ({ exDate: sessionDate(row.date, offset), amount: row.amount }))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  if (points.length === 0) return null;
  return {
    series: { ticker: fund.ticker, closes: points, distributions },
    regular: meta.currentTradingPeriod?.regular ?? null,
    regularMarketTime: typeof meta.regularMarketTime === "number" ? meta.regularMarketTime : null,
  };
}

async function loadProvider(spec: SectorProviderSpec, now: Date): Promise<ProviderPerformance> {
  const fetched = await Promise.all(
    spec.funds.map(async (fund) => {
      try {
        return await fetchFund(fund, spec);
      } catch {
        return null;
      }
    }),
  );
  const nowSec = Math.floor(now.getTime() / 1000);
  const reference = fetched.find((row) => row?.regular?.start != null && row.regular.end != null) ?? null;
  const start = reference?.regular?.start ?? null;
  const end = reference?.regular?.end ?? null;
  const sessionOpen = start != null && end != null && nowSec >= start && nowSec < end;
  const quotedAt = fetched.reduce<number | null>(
    (latest, row) => (row?.regularMarketTime != null && (latest == null || row.regularMarketTime > latest) ? row.regularMarketTime : latest),
    null,
  );

  const series = new Map<string, FundSeries | null>();
  spec.funds.forEach((fund, index) => {
    const row = fetched[index];
    if (!row) {
      series.set(fund.ticker, null);
      return;
    }
    // Before the open, a bar dated today is a placeholder rather than a session.
    const today = start != null ? new Date(start * 1000).toLocaleDateString("en-CA", { timeZone: spec.exchangeTimezone }) : null;
    const closes =
      start != null && nowSec < start && today != null
        ? row.series.closes.filter((point) => point.date !== today)
        : row.series.closes;
    series.set(fund.ticker, { ...row.series, closes });
  });

  return computeProviderPerformance(spec, series, utcDateDaysFromToday(0, now), {
    sessionOpen,
    quotedAt: quotedAt != null ? new Date(quotedAt * 1000).toISOString() : null,
  });
}

export async function loadSectorPerformance(now = new Date()): Promise<SectorPerformance> {
  const results = await Promise.all(SECTOR_PROVIDERS.map((id) => loadProvider(SECTOR_PROVIDER_SPECS[id], now)));
  return {
    providers: {
      invesco: results[0]!,
      wisdomtree: results[1]!,
    },
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}
