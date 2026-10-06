import { createServerFn } from "@tanstack/react-start";
import { fetchYahooDailyCloses } from "../derivatives/dailyCloses";
import { sectorMarketConfig, type SectorMarketId, type SectorSeriesSource } from "./sectorRotationMarkets";
import {
  emptyPeriodReturns,
  returnsFromCloses,
  type UsSectorRotationPayload,
  type UsSectorSeries,
} from "./usSectorRotation";

const FRED_TIMEOUT_MS = 12_000;

async function yahooCloses(symbol: string): Promise<number[] | null> {
  try {
    const points = await fetchYahooDailyCloses(symbol);
    const closes = points.map((point) => point.close).filter((close) => close > 0);
    return closes.length >= 2 ? closes : null;
  } catch {
    return null;
  }
}

/** Nasdaq daily index values via the public FRED graph CSV. Same pattern as NQGI history. */
async function fredCloses(seriesId: string): Promise<number[] | null> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 3);
    const url =
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}` +
      `&cosd=${start.toISOString().slice(0, 10)}&coed=${end.toISOString().slice(0, 10)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FRED_TIMEOUT_MS),
      headers: { Accept: "text/csv,*/*" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith("<")) return null;
    const closes: number[] = [];
    for (const line of text.trim().split(/\r?\n/).slice(1)) {
      const comma = line.indexOf(",");
      if (comma <= 0) continue;
      const raw = line.slice(comma + 1).trim();
      if (!raw || raw === ".") continue;
      const close = Number.parseFloat(raw);
      if (Number.isFinite(close) && close > 0) closes.push(close);
    }
    return closes.length >= 2 ? closes : null;
  } catch {
    return null;
  }
}

async function closesFor(source: SectorSeriesSource): Promise<number[] | null> {
  return source.kind === "yahoo" ? yahooCloses(source.symbol) : fredCloses(source.seriesId);
}

function isSectorMarket(value: unknown): value is SectorMarketId {
  return value === "US" || value === "SE";
}

/** Sector and benchmark history for one market. One failed series does not fail the rest. */
export const getSectorRotation = createServerFn({ method: "GET" })
  .inputValidator((market: SectorMarketId) => {
    if (!isSectorMarket(market)) throw new Error("Unknown sector market");
    return market;
  })
  .handler(async ({ data: market }): Promise<UsSectorRotationPayload> => {
    const config = sectorMarketConfig(market);
    const series = [config.benchmark, ...config.sectors];
    const settled = await Promise.all(
      series.map(async (item) => ({ symbol: item.symbol, closes: await closesFor(item.source) })),
    );
    const bySymbol = new Map(settled.map((row) => [row.symbol, row.closes]));
    const benchmarkCloses = bySymbol.get(config.benchmark.symbol) ?? null;

    const sectors: UsSectorSeries[] = config.sectors.map((sector) => {
      const closes = bySymbol.get(sector.symbol) ?? null;
      return {
        symbol: sector.symbol,
        name: sector.name,
        basket: sector.basket,
        returns: closes ? returnsFromCloses(closes) : emptyPeriodReturns(),
      };
    });

    return {
      market,
      fetchedAt: new Date().toISOString(),
      sectors,
      benchmark: benchmarkCloses ? returnsFromCloses(benchmarkCloses) : null,
    };
  });
