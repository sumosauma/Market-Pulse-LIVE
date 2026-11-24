/**
 * Commodity 1D (intraday) chart loaders.
 * Avanza retail indexes for Brent/WTI/Nat Gas/Gold/Silver — same orderbooks as Last.
 * Yahoo continuous futures for Wheat/Corn — same symbols as overview Last.
 * TTF / Nordic / LME cash: no verified same-instrument intraday → unavailable.
 */

import {
  AVANZA_COMMODITY_LABELS,
  fetchAvanzaCommodityIntraday,
  isAvanzaCommodityId,
  type AvanzaCommodityId,
} from "./avanzaCommodityHistory";
import {
  INTRADAY_MIN_POINTS,
  isIntradayEnabled,
  type CommodityIntradayPayload,
  type CommodityIntradaySeries,
  type IntradayPoint,
} from "./intraday";

export { isIntradayEnabled };

const FETCH_TIMEOUT_MS = 12_000;
const STALE_MS = 2 * 60 * 60 * 1000;

type YahooIntradaySpec = {
  id: string;
  symbol: string;
  currency: string;
  label: string;
};

/** Same continuous futures as overview Last — never LME cash or Avanza. */
const YAHOO_INTRADAY: readonly YahooIntradaySpec[] = [
  {
    id: "wheat",
    symbol: "ZW=F",
    currency: "USX",
    label: "CBOT wheat futures (Yahoo 5-minute)",
  },
  {
    id: "corn",
    symbol: "ZC=F",
    currency: "USX",
    label: "CBOT corn futures (Yahoo 5-minute)",
  },
];

const AVANZA_INTRADAY_IDS: readonly AvanzaCommodityId[] = [
  "brent",
  "wti",
  "henry-hub",
  "gold",
  "silver",
];

/** Desk ids that never get a 1D chip (no same-instrument intraday path). */
const UNAVAILABLE: Record<string, string> = {
  ttf: "Intraday data unavailable.",
  "nordic-power": "Intraday data unavailable.",
  copper: "Intraday data unavailable.",
  aluminium: "Intraday data unavailable.",
  nickel: "Intraday data unavailable.",
};

function emptySeries(
  id: string,
  reason: string,
): CommodityIntradaySeries {
  return {
    id,
    points: [],
    interval: "five_minutes",
    source: null,
    sourceLabel: null,
    sessionDate: null,
    exchangeTimezoneName: null,
    unavailableReason: reason,
    stale: false,
  };
}

function toPoints(bars: ReadonlyArray<{ timestamp: number; close: number }>): IntradayPoint[] {
  return bars.map((bar) => ({
    date: new Date(bar.timestamp).toISOString(),
    price: bar.close,
  }));
}

async function fetchYahooIntraday(spec: YahooIntradaySpec): Promise<CommodityIntradaySeries> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.symbol)}?interval=5m&range=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return emptySeries(spec.id, "Intraday data unavailable.");
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          meta?: {
            instrumentType?: string;
            currency?: string;
            exchangeTimezoneName?: string;
            regularMarketTime?: number;
          };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!result || !meta || meta.instrumentType !== "FUTURE" || meta.currency !== spec.currency) {
      return emptySeries(spec.id, "Intraday data unavailable.");
    }
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const bars: { timestamp: number; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      const ts = timestamps[i];
      if (typeof close !== "number" || !(close > 0) || typeof ts !== "number") continue;
      bars.push({ timestamp: ts * 1000, close });
    }
    bars.sort((a, b) => a.timestamp - b.timestamp);
    if (bars.length < INTRADAY_MIN_POINTS) {
      return emptySeries(spec.id, "Intraday data unavailable.");
    }
    const lastTs = bars[bars.length - 1]!.timestamp;
    const tz = meta.exchangeTimezoneName ?? "America/New_York";
    let sessionDate: string | null = null;
    try {
      sessionDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(lastTs));
    } catch {
      sessionDate = new Date(lastTs).toISOString().slice(0, 10);
    }
    return {
      id: spec.id,
      points: toPoints(bars),
      interval: "five_minutes",
      source: "yahoo-futures",
      sourceLabel: spec.label,
      sessionDate,
      exchangeTimezoneName: meta.exchangeTimezoneName ?? null,
      unavailableReason: null,
      stale: Date.now() - lastTs > STALE_MS,
    };
  } catch {
    return emptySeries(spec.id, "Intraday data unavailable.");
  }
}

async function fetchAvanzaIntradaySeries(id: AvanzaCommodityId): Promise<CommodityIntradaySeries> {
  const labels = AVANZA_COMMODITY_LABELS[id];
  try {
    const payload = await fetchAvanzaCommodityIntraday(id);
    if (!payload || payload.bars.length < INTRADAY_MIN_POINTS) {
      return emptySeries(id, "Intraday data unavailable.");
    }
    const lastTs = payload.bars[payload.bars.length - 1]!.timestamp;
    return {
      id,
      points: toPoints(payload.bars),
      interval: "five_minutes",
      source: "avanza",
      sourceLabel: `${labels.ticker} · 5-minute`,
      sessionDate: payload.sessionDate,
      exchangeTimezoneName: null,
      unavailableReason: null,
      stale: Date.now() - lastTs > STALE_MS,
    };
  } catch {
    return emptySeries(id, "Intraday data unavailable.");
  }
}

export async function loadCommodityIntraday(): Promise<CommodityIntradayPayload> {
  const [avanzaRows, yahooRows] = await Promise.all([
    Promise.all(AVANZA_INTRADAY_IDS.map((id) => fetchAvanzaIntradaySeries(id))),
    Promise.all(YAHOO_INTRADAY.map((spec) => fetchYahooIntraday(spec))),
  ]);

  const byId = new Map<string, CommodityIntradaySeries>();
  for (const row of [...avanzaRows, ...yahooRows]) byId.set(row.id, row);
  for (const [id, reason] of Object.entries(UNAVAILABLE)) {
    if (!byId.has(id)) byId.set(id, emptySeries(id, reason));
  }

  // Stable desk order for consumers that iterate.
  const order = [
    "brent",
    "wti",
    "ttf",
    "henry-hub",
    "nordic-power",
    "gold",
    "silver",
    "copper",
    "aluminium",
    "nickel",
    "wheat",
    "corn",
  ];
  const series = order.map(
    (id) => byId.get(id) ?? emptySeries(id, "Intraday data unavailable."),
  );

  return {
    series,
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}

export function isAvanzaIntradayId(id: string): boolean {
  return isAvanzaCommodityId(id);
}
