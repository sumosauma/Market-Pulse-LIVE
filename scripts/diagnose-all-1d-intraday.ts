/**
 * Read-only 1D intraday coverage audit for all equity indexes — delete after use.
 */
import { EQUITY_MARKETS } from "../src/lib/equities/equityMarketsRegistry";
import {
  exchangeLocalDateKey,
  exchangeLocalMinutesSinceMidnight,
  exchangeTzFromRow,
} from "../src/lib/equities/equityExchangeTz";
import { intradayLastSession } from "../src/lib/equities/equityIntradaySession";
import {
  fmtSessionClock,
  getSessionWindowForMarket,
  type SessionWindow,
} from "../src/lib/equities/equitySessionWindow";
import { fetchOmxn40AvanzaIntraday } from "../src/lib/equities/sources/omxn40AvanzaFallback";
import type { EquityHistoryPoint } from "../src/lib/equities/types";

const FETCH_TIMEOUT_MS = 12_000;

type YahooChartResult = {
  meta?: {
    exchangeTimezoneName?: unknown;
    gmtoffset?: unknown;
    timezone?: unknown;
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
};

function downsamplePoints(points: EquityHistoryPoint[], maxPoints = 90): EquityHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const out: EquityHistoryPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}

function parseYahooIntraday(result: YahooChartResult): EquityHistoryPoint[] {
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: EquityHistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") points.push({ date: new Date(ts[i]! * 1000).toISOString(), price: c });
  }
  return points;
}

async function fetchYahooIntraday(ticker: string): Promise<{
  rawCount: number;
  points: EquityHistoryPoint[];
  meta: YahooChartResult["meta"];
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=30m&range=5d`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as { chart?: { result?: YahooChartResult[] } };
  const r = json.chart?.result?.[0];
  if (!r) throw new Error("No chart result");
  const points = parseYahooIntraday(r);
  return { rawCount: r.timestamp?.length ?? 0, points, meta: r.meta };
}

function fmtLocal(iso: string, tzName: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tzName,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function tzName(tz: ReturnType<typeof exchangeTzFromRow>): string {
  return tz.exchangeTimezoneName ?? "UTC";
}

type Coverage =
  | "good"
  | "partial"
  | "sparse"
  | "none";

function classify(input: {
  session: EquityHistoryPoint[];
  window: SessionWindow;
  tz: ReturnType<typeof exchangeTzFromRow>;
  tzLabel: string;
}): { coverage: Coverage; reason: string; action: string } {
  const { session, window, tz, tzLabel } = input;
  const n = session.length;

  if (n < 2) {
    return {
      coverage: "none",
      reason: n === 0 ? "no valid intraday bars after filtering" : "only one stale bar in latest session",
      action: "investigate alternative source",
    };
  }

  const firstM = exchangeLocalMinutesSinceMidnight(session[0]!.date, tz)!;
  const lastM = exchangeLocalMinutesSinceMidnight(session[n - 1]!.date, tz)!;
  const sessionDate = exchangeLocalDateKey(session[n - 1]!.date, tz);
  const todayKey = exchangeLocalDateKey(new Date().toISOString(), tz);
  const isToday = sessionDate === todayKey;
  const span = window.closeMinutes - window.openMinutes;
  const covered = Math.max(0, Math.min(lastM, window.closeMinutes) - Math.max(firstM, window.openMinutes));
  const coveragePct = span > 0 ? (covered / span) * 100 : 0;
  const startsNearOpen = firstM <= window.openMinutes + 45;
  const endsNearClose = lastM >= window.closeMinutes - 45;
  const inProgress = isToday && !endsNearClose;
  const afternoonOnly = firstM >= window.openMinutes + 120;

  if (inProgress && n >= 4 && startsNearOpen) {
    return {
      coverage: "partial",
      reason: "latest session still in progress; bars regular from open so far",
      action: "no action",
    };
  }

  if (n >= 10 && coveragePct >= 55 && startsNearOpen) {
    return {
      coverage: "good",
      reason: "enough bars across most of the trading session",
      action: "no action",
    };
  }

  if (n >= 8 && coveragePct >= 70 && startsNearOpen && endsNearClose) {
    return {
      coverage: "good",
      reason: "full session covered with regular 30m bars",
      action: "no action",
    };
  }

  if (n < 6 || afternoonOnly || coveragePct < 35) {
    const parts: string[] = [];
    if (n < 6) parts.push(`only ${n} bars in selected session`);
    if (afternoonOnly) parts.push("only afternoon/late-day bars (missing morning)");
    if (coveragePct < 35) parts.push(`covers ~${coveragePct.toFixed(0)}% of session window`);
    return {
      coverage: "sparse",
      reason: parts.join("; ") || "sparse session coverage",
      action: afternoonOnly || n < 6 ? "source fallback needed" : "investigate alternative source",
    };
  }

  if (n >= 6 && startsNearOpen && (endsNearClose || inProgress)) {
    return {
      coverage: inProgress ? "partial" : "good",
      reason: inProgress
        ? "session in progress with reasonable bar count"
        : "acceptable bar count with minor session gaps",
      action: "no action",
    };
  }

  return {
    coverage: "sparse",
    reason: `selected session does not represent full trading day well (${n} bars, ~${coveragePct.toFixed(0)}% span)`,
    action: "source fallback needed",
  };
}

async function intradayForMarket(market: (typeof EQUITY_MARKETS)[number]): Promise<{
  source: string;
  rawCount: number;
  validCount: number;
  points: EquityHistoryPoint[];
  meta: YahooChartResult["meta"] | null;
}> {
  if (market.countryId === "omxn40") {
    const avanza = await fetchOmxn40AvanzaIntraday();
    return {
      source: "Avanza (OMXN40 fallback)",
      rawCount: avanza?.length ?? 0,
      validCount: avanza?.length ?? 0,
      points: avanza ?? [],
      meta: { exchangeTimezoneName: "Europe/Stockholm", gmtoffset: 3600 },
    };
  }

  if (market.countryId === "ZA") {
    const y = await fetchYahooIntraday("^NQZA");
    const points = downsamplePoints(y.points);
    return {
      source: "Yahoo Finance (^NQZA intraday; FRED daily elsewhere)",
      rawCount: y.rawCount,
      validCount: y.points.length,
      points,
      meta: y.meta,
    };
  }

  const y = await fetchYahooIntraday(market.ticker);
  const points = downsamplePoints(y.points);
  let source = market.source;
  if (market.countryId === "eu500") {
    source = "Yahoo Finance (EU500.AS; Avanza daily-only fallback, no intraday fallback)";
  }
  return {
    source,
    rawCount: y.rawCount,
    validCount: y.points.length,
    points,
    meta: y.meta,
  };
}

type Row = {
  country: string;
  index: string;
  ticker: string;
  source: string;
  rawTimestamps: number;
  validCloses: number;
  sessionDate: string | null;
  sessionBars: number;
  firstLocal: string | null;
  lastLocal: string | null;
  sessionWindow: string;
  coverage: Coverage;
  reason: string;
  action: string;
};

const rows: Row[] = [];

for (const market of EQUITY_MARKETS) {
  try {
    const { source, rawCount, validCount, points, meta } = await intradayForMarket(market);
    const tz = exchangeTzFromRow({
      ticker: market.ticker,
      exchangeTimezoneName:
        typeof meta?.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null,
      gmtoffset: typeof meta?.gmtoffset === "number" ? meta.gmtoffset : null,
      timezone: typeof meta?.timezone === "string" ? meta.timezone : null,
    });
    const tzLabel = tzName(tz);
    const window = getSessionWindowForMarket(market.countryId, market.region)!;
    const session = intradayLastSession(points, tz);
    const sessionDate =
      session.length > 0 ? exchangeLocalDateKey(session[session.length - 1]!.date, tz) : null;
    const { coverage, reason, action } = classify({ session, window, tz, tzLabel });

    rows.push({
      country: market.countryName,
      index: market.indexName,
      ticker: market.ticker,
      source,
      rawTimestamps: rawCount,
      validCloses: validCount,
      sessionDate,
      sessionBars: session.length,
      firstLocal: session[0] ? fmtLocal(session[0].date, tzLabel) : null,
      lastLocal: session[session.length - 1]
        ? fmtLocal(session[session.length - 1]!.date, tzLabel)
        : null,
      sessionWindow: `${fmtSessionClock(window.openMinutes)}–${fmtSessionClock(window.closeMinutes)}`,
      coverage,
      reason,
      action,
    });
  } catch (e) {
    rows.push({
      country: market.countryName,
      index: market.indexName,
      ticker: market.ticker,
      source: market.source,
      rawTimestamps: 0,
      validCloses: 0,
      sessionDate: null,
      sessionBars: 0,
      firstLocal: null,
      lastLocal: null,
      sessionWindow: "—",
      coverage: "none",
      reason: e instanceof Error ? e.message : "fetch failed",
      action: "investigate alternative source",
    });
  }
}

console.log(JSON.stringify(rows, null, 2));
