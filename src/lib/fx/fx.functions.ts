import { createServerFn } from "@tanstack/react-start";
import {
  historyCacheKey,
  readAnyHistory,
  readAnyLive,
  readFreshHistory,
  readFreshLive,
  writeHistory,
  writeLive,
} from "./cache";
import { rangeForTimeframe, todayISO } from "./dates";
import { fetchLatest, fetchTimeseries, pointsFromTimeseries } from "./frankfurter";
import { DEFAULT_FX_PAIR, FX_PAIRS, fxQuoteGroups, getFxPair, isFxPairId, type FxPairDef } from "./pairs";
import { lastTwoPoints } from "./slice";
import type { FxHistoryPayload, FxLivePayload, FxLiveRow, FxPoint, FxTimeframe } from "./types";

export const FX_LIVE_QUERY_KEY = ["fx-live", "frankfurter", "v1"] as const;

export function fxHistoryQueryKey(pairId: string, timeframe: FxTimeframe) {
  return ["fx-history", "frankfurter", "v1", pairId, timeframe] as const;
}

let inflightLive: Promise<FxLivePayload> | null = null;
const inflightHistory = new Map<string, Promise<{ points: FxPoint[]; fromCache: boolean }>>();

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(msg)) return "Frankfurter request timed out";
  if (/HTTP 4\d\d|HTTP 5\d\d/i.test(msg)) return "Frankfurter is unavailable";
  return msg.slice(0, 160);
}

function emptyRow(pair: FxPairDef, error: string | null, fromCache = false): FxLiveRow {
  return {
    pairId: pair.id,
    label: pair.label,
    rate: null,
    change1d: null,
    change1dPct: null,
    spotAsOf: null,
    dailyAsOf: null,
    fromCache,
    error,
  };
}

function prevClose(points: readonly FxPoint[], asOf: string | null, latestRate: number | null): number | null {
  if (!points.length) return null;
  if (asOf) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i]!.date < asOf) return points[i]!.close;
    }
  }
  if (points.length >= 2) return points[points.length - 2]!.close;
  if (latestRate != null && points.length === 1 && points[0]!.close !== latestRate) {
    return points[0]!.close;
  }
  return null;
}

async function loadLiveTable(): Promise<FxLivePayload> {
  const fresh = readFreshLive();
  if (fresh) {
    console.log(`[FX] live cache hit asOf=${fresh.asOf} rows=${fresh.rows.length}`);
    return { ...fresh, fromCache: true, rows: fresh.rows.map((r) => ({ ...r, fromCache: true })) };
  }
  if (inflightLive) return inflightLive;

  inflightLive = (async () => {
    try {
      const groups = fxQuoteGroups();
      const end = todayISO();
      const start = rangeForTimeframe("1D", end).from;

      const [latestList, seriesList] = await Promise.all([
        Promise.all(groups.map((g) => fetchLatest(g.base, g.symbols))),
        Promise.all(groups.map((g) => fetchTimeseries(start, end, g.base, g.symbols))),
      ]);

      const latestByBase = new Map(latestList.map((row) => [row.base, row]));
      const seriesByBase = new Map(groups.map((g, i) => [g.base, seriesList[i]!]));

      const asOf = latestList[0]?.date ?? null;
      const rows: FxLiveRow[] = FX_PAIRS.map((pair) => {
        const latest = latestByBase.get(pair.from);
        const series = seriesByBase.get(pair.from);
        const rate = latest?.rates[pair.to] ?? null;
        const spotAsOf = latest?.date ?? null;
        if (rate == null || !Number.isFinite(rate)) {
          return emptyRow(pair, "No Frankfurter rate");
        }
        const hist = series ? pointsFromTimeseries(series, pair.to) : [];
        const prev = prevClose(hist, spotAsOf, rate);
        const change1d = prev != null ? rate - prev : null;
        const change1dPct = prev != null && prev !== 0 ? (change1d! / prev) * 100 : null;
        return {
          pairId: pair.id,
          label: pair.label,
          rate,
          change1d,
          change1dPct,
          spotAsOf,
          dailyAsOf: spotAsOf,
          fromCache: false,
          error: null,
        };
      });

      const payload: FxLivePayload = {
        rows,
        fetchedAt: new Date().toISOString(),
        asOf,
        fromCache: false,
        error: null,
      };
      writeLive(payload);
      console.log(`[FX] live frankfurter asOf=${asOf} rows=${rows.length}`);
      return payload;
    } catch (err) {
      const stale = readAnyLive();
      if (stale?.rows.length) {
        console.log(`[FX] live stale-cache after ${friendlyError(err)}`);
        return {
          ...stale,
          fromCache: true,
          error: null,
          rows: stale.rows.map((r) => ({ ...r, fromCache: true })),
        };
      }
      const message = friendlyError(err);
      return {
        rows: FX_PAIRS.map((pair) => emptyRow(pair, message)),
        fetchedAt: new Date().toISOString(),
        asOf: null,
        fromCache: false,
        error: message,
      };
    } finally {
      inflightLive = null;
    }
  })();

  return inflightLive;
}

async function loadHistory(pair: FxPairDef, timeframe: FxTimeframe): Promise<{ points: FxPoint[]; fromCache: boolean }> {
  const key = historyCacheKey(pair.id, timeframe);
  const fresh = readFreshHistory(key);
  if (fresh) {
    console.log(`[FX][${pair.id}] ${timeframe} cache hit points=${fresh.points.length}`);
    return { points: fresh.points, fromCache: true };
  }
  const pending = inflightHistory.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const { from, to } = rangeForTimeframe(timeframe);
      const series = await fetchTimeseries(from, to, pair.from, [pair.to]);
      let points = pointsFromTimeseries(series, pair.to);
      if (timeframe === "1D") points = lastTwoPoints(points);
      if (points.length < 2) throw new Error(`Not enough Frankfurter history for ${pair.label} ${timeframe}`);
      writeHistory(key, points);
      console.log(`[FX][${pair.id}] ${timeframe} live points=${points.length}`);
      return { points, fromCache: false };
    } catch (err) {
      const stale = readAnyHistory(key);
      if (stale?.points.length) {
        console.log(`[FX][${pair.id}] ${timeframe} stale-cache after ${friendlyError(err)}`);
        return { points: stale.points, fromCache: true };
      }
      throw err;
    } finally {
      inflightHistory.delete(key);
    }
  })();
  inflightHistory.set(key, task);
  return task;
}

export const getFxLiveRates = createServerFn({ method: "GET" }).handler(async (): Promise<FxLivePayload> => {
  return loadLiveTable();
});

type HistoryInput = { pairId?: string; timeframe?: FxTimeframe };

export const getFxHistory = createServerFn({ method: "POST" })
  .inputValidator((data: HistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<FxHistoryPayload> => {
    const requested = data.pairId ?? "";
    const pairId = isFxPairId(requested) ? requested : DEFAULT_FX_PAIR;
    const timeframe: FxTimeframe =
      data.timeframe === "1D" || data.timeframe === "1W" || data.timeframe === "1Y" || data.timeframe === "5Y"
        ? data.timeframe
        : "1M";
    const pair = getFxPair(pairId)!;
    try {
      const loaded = await loadHistory(pair, timeframe);
      return {
        pairId,
        label: pair.label,
        timeframe,
        points: loaded.points,
        fromCache: loaded.fromCache,
        fetchedAt: new Date().toISOString(),
        error: null,
      };
    } catch (err) {
      return {
        pairId,
        label: pair.label,
        timeframe,
        points: [],
        fromCache: false,
        fetchedAt: new Date().toISOString(),
        error: friendlyError(err),
      };
    }
  });
