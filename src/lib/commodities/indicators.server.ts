import {
  computeAbsChangeVol20,
  computeRv20,
  rollingAbsChangeVol20Series,
  rollingRv20Series,
  rv20Percentile1y,
} from "@/lib/derivatives/realizedVol";
import { percentileFromDatedCloses } from "@/lib/derivatives/percentile";
import type { Rv20Kind } from "./indicators";
import { MONTH_CODES, EARLIER_QUOTE_MS, contractLabel } from "./futuresCurve";
import { fetchListedSession } from "./futuresCurve.server";
import {
  COPPER_GOLD_MIN_SESSIONS,
  HISTORY_STALE_DAYS,
  SPOT_ALIGN_MS,
  crossMarketHistoryStats,
  emptyCrossMarketHistory,
  joinRatioSeries,
  joinSpreadSeries,
  normalizedRatioIndex,
  type BrentWtiSpread,
  type CommodityIndicators,
  type CopperGoldRatio,
  type CrossMarketHistory,
  type HistoryIndicator,
  type HistoryPoint,
  type MetalRatio,
} from "./indicators";
import {
  AVANZA_COMMODITY_LABELS,
  fetchAvanzaCommodityDailyHistory,
  isAvanzaCommodityId,
} from "./avanzaCommodityHistory";
import { fetchNordicSysDailyHistory } from "./nordicSysHistory";
import { calendarDaysBetween, parseWestmetallCash, utcDateDaysFromToday } from "./overview";
import {
  PERCENTILE_LOOKBACK_SESSIONS,
  PERCENTILE_MIN_OBSERVATIONS,
} from "@/lib/derivatives/percentile";

const FETCH_TIMEOUT_MS = 12_000;
const RATIO_WINDOW = 252;
const LME_HISTORY_YEARS = 2;
/** Exchange calendars: weekends + short holidays stay inside this bound. */
const FUTURES_MAX_GAP_DAYS = 14;
/** LME cash publishes on most London business days. */
const LME_MAX_GAP_DAYS = 14;
/** Nord Pool day-ahead SYS usually prints every calendar day. */
const NORDIC_MAX_GAP_DAYS = 4;

type YahooHistorySpec = {
  id: string;
  name: string;
  ticker: string;
  currency: string;
  unit: string;
  contractLabel: string;
  source: "yahoo-futures";
};

type LmeHistorySpec = {
  id: string;
  name: string;
  ticker: string;
  unit: string;
  contractLabel: string;
  source: "lme-cash";
  field: string;
  header: string;
};

type NordicHistorySpec = {
  id: string;
  name: string;
  ticker: string;
  unit: string;
  contractLabel: string;
  source: "nordpool-sys";
};

type HistorySpec = YahooHistorySpec | LmeHistorySpec | NordicHistorySpec;

const HISTORY: HistorySpec[] = [
  {
    id: "brent",
    name: "Brent",
    ticker: "BZ=F",
    currency: "USD",
    unit: "USD/bbl",
    contractLabel: "Yahoo NYMEX Brent futures (fallback only if Avanza history is unavailable)",
    source: "yahoo-futures",
  },
  {
    id: "wti",
    name: "WTI",
    ticker: "CL=F",
    currency: "USD",
    unit: "USD/bbl",
    contractLabel: "Yahoo NYMEX WTI futures (fallback only if Avanza history is unavailable)",
    source: "yahoo-futures",
  },
  {
    id: "ttf",
    name: "TTF",
    ticker: "TTF=F",
    currency: "EUR",
    unit: "EUR/MWh",
    contractLabel: "NYMEX Dutch TTF natural gas futures",
    source: "yahoo-futures",
  },
  {
    id: "henry-hub",
    name: "Natural Gas",
    ticker: "NG=F",
    currency: "USD",
    unit: "USD/MMBtu",
    contractLabel: "Yahoo NYMEX NG futures (fallback only if Avanza Naturgas history is unavailable)",
    source: "yahoo-futures",
  },
  {
    id: "nordic-power",
    name: "Nordic Power",
    ticker: "Nord Pool SYS",
    unit: "EUR/MWh",
    contractLabel: "Nord Pool day-ahead system price (SYS)",
    source: "nordpool-sys",
  },
  {
    id: "gold",
    name: "Gold",
    ticker: "GC=F",
    currency: "USD",
    unit: "USD/oz",
    contractLabel: "Yahoo COMEX gold futures (fallback only if Avanza OTC history is unavailable)",
    source: "yahoo-futures",
  },
  {
    id: "silver",
    name: "Silver",
    ticker: "SI=F",
    currency: "USD",
    unit: "USD/oz",
    contractLabel: "Yahoo COMEX silver futures (fallback only if Avanza OTC history is unavailable)",
    source: "yahoo-futures",
  },
  {
    id: "copper",
    name: "Copper",
    ticker: "LME Cu cash",
    unit: "USD/t",
    contractLabel: "LME copper cash settlement",
    source: "lme-cash",
    field: "LME_Cu_cash",
    header: "LME Copper Cash-Settlement",
  },
  {
    id: "aluminium",
    name: "Aluminium",
    ticker: "LME Al cash",
    unit: "USD/t",
    contractLabel: "LME aluminium cash settlement",
    source: "lme-cash",
    field: "LME_Al_cash",
    header: "LME Aluminium Cash-Settlement",
  },
  {
    id: "nickel",
    name: "Nickel",
    ticker: "LME Ni cash",
    unit: "USD/t",
    contractLabel: "LME nickel cash settlement",
    source: "lme-cash",
    field: "LME_Ni_cash",
    header: "LME Nickel Cash-Settlement",
  },
  {
    id: "wheat",
    name: "Wheat",
    ticker: "ZW=F",
    currency: "USX",
    unit: "USc/bu",
    contractLabel: "CBOT front-month Chicago SRW wheat futures",
    source: "yahoo-futures",
  },
  {
    id: "corn",
    name: "Corn",
    ticker: "ZC=F",
    currency: "USX",
    unit: "USc/bu",
    contractLabel: "CBOT front-month corn futures",
    source: "yahoo-futures",
  },
];

type FrontMonth = { closes: HistoryPoint[] };

type LoadedHistory = {
  series: FrontMonth | null;
  ticker: string;
  contractLabel: string;
  /** When true, gap rules use the futures calendar bound (Avanza retail indexes). */
  fromAvanza: boolean;
};

async function fetchYahooFuturesHistory(
  ticker: string,
  currency: string,
  opts: { includeToday?: boolean } = {},
): Promise<FrontMonth | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        meta?: { symbol?: string; currency?: string; instrumentType?: string };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  if (!result || !meta || meta.symbol !== ticker || meta.instrumentType !== "FUTURE" || meta.currency !== currency) {
    return null;
  }
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const todayUtc = new Date().toISOString().slice(0, 10);
  const points: HistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    const ts = timestamps[i];
    if (typeof close === "number" && close > 0 && typeof ts === "number") {
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      // Skip incomplete current-day candle for RV / Price History (Cross-Market listed may keep it).
      if (!opts.includeToday && date >= todayUtc) continue;
      points.push({ date, close });
    }
  }
  return points.length > 0 ? { closes: points } : null;
}

async function fetchWestmetallYear(field: string, header: string, year: number): Promise<HistoryPoint[] | null> {
  const url = `https://www.westmetall.com/en/markdaten.php?action=table&field=${field}&year=${year}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const parsed = parseWestmetallCash(await res.text(), header);
  if (!parsed) return null;
  return parsed.map((point) => ({ date: point.date, close: point.price }));
}

async function fetchLmeCashHistory(field: string, header: string): Promise<FrontMonth | null> {
  const yearNow = new Date().getUTCFullYear();
  const years = Array.from({ length: LME_HISTORY_YEARS }, (_, i) => yearNow - i);
  const batches = await Promise.all(years.map((year) => fetchWestmetallYear(field, header, year)));
  const byDate = new Map<string, number>();
  for (const batch of batches) {
    if (!batch) continue;
    for (const point of batch) {
      if (Number.isFinite(point.close) && point.close > 0) byDate.set(point.date, point.close);
    }
  }
  const closes = [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return closes.length > 0 ? { closes } : null;
}

async function fetchNordicSysHistory(): Promise<FrontMonth | null> {
  const closes = await fetchNordicSysDailyHistory();
  return closes.length > 0 ? { closes } : null;
}

async function fetchFallbackHistory(spec: HistorySpec): Promise<FrontMonth | null> {
  if (spec.source === "yahoo-futures") return fetchYahooFuturesHistory(spec.ticker, spec.currency);
  if (spec.source === "lme-cash") return fetchLmeCashHistory(spec.field, spec.header);
  return fetchNordicSysHistory();
}

/** Prefer Avanza daily closes when mapped; otherwise the existing source. Never splice series. */
async function loadHistorySeries(spec: HistorySpec): Promise<LoadedHistory> {
  if (isAvanzaCommodityId(spec.id)) {
    const bars = await fetchAvanzaCommodityDailyHistory(spec.id);
    if (bars && bars.length >= 2) {
      const labels = AVANZA_COMMODITY_LABELS[spec.id];
      return {
        series: { closes: bars },
        ticker: labels.ticker,
        contractLabel: labels.contractLabel,
        fromAvanza: true,
      };
    }
  }
  const series = await fetchFallbackHistory(spec);
  return {
    series,
    ticker: spec.ticker,
    contractLabel: spec.contractLabel,
    fromAvanza: false,
  };
}

function historyRow(spec: HistorySpec, loaded: LoadedHistory, today: string): HistoryIndicator {
  const base = {
    id: spec.id,
    name: spec.name,
    ticker: loaded.ticker,
    unit: spec.unit,
    contractLabel: loaded.contractLabel,
  };
  /** Nord Pool can print ≤0 prices — use abs ΔP vol there; all others use log-return ann. %. */
  const rvKind: Rv20Kind = spec.source === "nordpool-sys" ? "abs_change" : "ann_pct";
  const series = loaded.series;

  if (!series) {
    return {
      ...base,
      rv20: null,
      rvAsOf: null,
      rvKind,
      rvPercentile1y: null,
      rvPercentileSessions: null,
      percentile: null,
      percentileSessions: null,
      priceAsOf: null,
      stale: false,
      unavailableReason: `N/A. ${loaded.ticker} did not return a verified price history.`,
      bars: [],
    };
  }

  const maxGapDays =
    spec.source === "nordpool-sys"
      ? NORDIC_MAX_GAP_DAYS
      : spec.source === "lme-cash"
        ? LME_MAX_GAP_DAYS
        : FUTURES_MAX_GAP_DAYS;

  let rv20: number | null = null;
  let rvAsOf: string | null = null;
  let rvPercentile1y: number | null = null;
  let rvPercentileSessions: number | null = null;

  if (rvKind === "abs_change") {
    const abs = computeAbsChangeVol20(series.closes, { maxGapDays });
    rv20 = abs?.vol ?? null;
    rvAsOf = abs?.asOf ?? null;
    const rolling = rollingAbsChangeVol20Series(series.closes, { maxGapDays });
    rvPercentileSessions = rolling.length;
    const ranked = rv20Percentile1y(rolling);
    rvPercentile1y = ranked?.percentile ?? null;
    if (ranked) rvPercentileSessions = ranked.observationCount;
  } else {
    const rvOptions = { maxGapDays };
    const rv = computeRv20(series.closes, rvOptions);
    rv20 = rv?.rv20 ?? null;
    rvAsOf = rv?.asOf ?? null;
    const rolling = rollingRv20Series(series.closes, rvOptions);
    rvPercentileSessions = rolling.length;
    const ranked = rv20Percentile1y(rolling);
    rvPercentile1y = ranked?.percentile ?? null;
    if (ranked) rvPercentileSessions = ranked.observationCount;
  }

  const percentile = rvKind === "abs_change" ? null : percentileFromDatedCloses(series.closes);
  const priceAsOf = series.closes[series.closes.length - 1]?.date ?? null;
  const age = priceAsOf ? calendarDaysBetween(priceAsOf, today) : null;
  const rvMissing = rv20 == null;
  const percentileMissing = percentile == null;
  const volPctMissing = rvPercentile1y == null;

  let unavailableReason: string | null = null;
  if (rvMissing && percentileMissing) {
    unavailableReason =
      rvKind === "abs_change"
        ? "N/A. Not enough consecutive Nord Pool SYS delivery days for a 20-day absolute price-change volatility."
        : "N/A. Not enough daily closes for a 20-day realized volatility or a one-year percentile.";
  } else if (rvMissing) {
    unavailableReason =
      rvKind === "abs_change"
        ? "N/A. Need 21 consecutive SYS delivery days without large gaps for absolute price-change volatility (EUR/MWh)."
        : "N/A. Need 21 valid sessions without large unexplained gaps for 20-day realized volatility.";
  } else if (rvKind === "abs_change" && volPctMissing) {
    const have = rvPercentileSessions ?? 0;
    unavailableReason =
      `N/A. 1Y volatility percentile needs ≥${PERCENTILE_MIN_OBSERVATIONS} rolling 20D vol observations ` +
      `(≈${PERCENTILE_LOOKBACK_SESSIONS + 20} SYS delivery days); have ${have} vol obs / ${series.closes.length} prices. ` +
      `Free Nord Pool SYS history is a short recent window; older dates require a paid licence.`;
  }

  return {
    ...base,
    rv20,
    rvAsOf,
    rvKind,
    rvPercentile1y,
    rvPercentileSessions,
    percentile: percentile?.percentile ?? null,
    percentileSessions: percentile?.observationCount ?? null,
    priceAsOf,
    stale: age == null || age > HISTORY_STALE_DAYS,
    unavailableReason,
    bars: series.closes.slice(-Math.max(260, PERCENTILE_LOOKBACK_SESSIONS + 30)),
  };
}

function upcomingMonthCodes(count: number, now: Date): { year: number; monthIndex: number; suffix: string }[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  let year = Number(parts.find((part) => part.type === "year")?.value);
  let monthIndex = Number(parts.find((part) => part.type === "month")?.value) - 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ year, monthIndex, suffix: `${MONTH_CODES[monthIndex]}${String(year).slice(2)}` });
    monthIndex += 1;
    if (monthIndex === 12) {
      monthIndex = 0;
      year += 1;
    }
  }
  return out;
}

async function loadBrentWti(now: Date): Promise<BrentWtiSpread> {
  const pendingHistory = emptyCrossMarketHistory("Historical analytics unavailable. Historical spread series not attached.");
  const unavailable = (reason: string): BrentWtiSpread => ({
    value: null,
    unit: "USD/bbl",
    monthLabel: null,
    sessionDate: null,
    brentPrice: null,
    wtiPrice: null,
    brentSymbol: null,
    wtiSymbol: null,
    brentTradeAt: null,
    wtiTradeAt: null,
    earlierQuote: false,
    sourceLabel: null,
    unavailableReason: reason,
    history: pendingHistory,
  });
  try {
    const months = upcomingMonthCodes(8, now);
    const quotes = await Promise.all(
      months.flatMap((month) => [
        fetchListedSession(`BZ${month.suffix}.NYM`),
        fetchListedSession(`CL${month.suffix}.NYM`),
      ]),
    );
    for (const month of months) {
      const brent = quotes.find(
        (quote) =>
          quote?.symbol === `BZ${month.suffix}.NYM` &&
          quote.currency === "USD" &&
          quote.name.includes("Brent Crude Oil Last Day") &&
          quote.volume > 0,
      );
      const wti = quotes.find(
        (quote) =>
          quote?.symbol === `CL${month.suffix}.NYM` &&
          quote.currency === "USD" &&
          quote.name.includes("Crude Oil") &&
          quote.nameStatus === "match" &&
          quote.volume > 0,
      );
      if (!brent || !wti || brent.sessionDate !== wti.sessionDate) continue;
      const brentTrade = Date.parse(brent.lastTradeAt);
      const wtiTrade = Date.parse(wti.lastTradeAt);
      return {
        value: brent.price - wti.price,
        unit: "USD/bbl",
        monthLabel: contractLabel(month.monthIndex, month.year),
        sessionDate: brent.sessionDate,
        brentPrice: brent.price,
        wtiPrice: wti.price,
        brentSymbol: brent.symbol,
        wtiSymbol: wti.symbol,
        brentTradeAt: brent.lastTradeAt,
        wtiTradeAt: wti.lastTradeAt,
        earlierQuote:
          Number.isFinite(brentTrade) &&
          Number.isFinite(wtiTrade) &&
          Math.abs(brentTrade - wtiTrade) > EARLIER_QUOTE_MS,
        sourceLabel: "Yahoo · NYMEX",
        unavailableReason: null,
        history: pendingHistory,
      };
    }
    return unavailable("N/A. No Brent and WTI month shared a session, currency, and verified contract name.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "The spread request failed.";
    return unavailable(`N/A. ${message}`);
  }
}

async function loadGoldSilver(): Promise<MetalRatio> {
  const pendingHistory = emptyCrossMarketHistory("Historical analytics unavailable. Historical ratio series not attached.");
  const unavailable = (reason: string): MetalRatio => ({
    value: null,
    goldPrice: null,
    silverPrice: null,
    goldAt: null,
    silverAt: null,
    sourceLabel: null,
    unavailableReason: reason,
    history: pendingHistory,
  });
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      fetch("https://api.gold-api.com/price/XAG", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    ]);
    if (!goldRes.ok || !silverRes.ok) return unavailable("N/A. The spot feed did not return both metals.");
    const gold = (await goldRes.json()) as { symbol?: string; currency?: string; price?: number; updatedAt?: string };
    const silver = (await silverRes.json()) as { symbol?: string; currency?: string; price?: number; updatedAt?: string };
    if (gold.symbol !== "XAU" || silver.symbol !== "XAG" || gold.currency !== "USD" || silver.currency !== "USD") {
      return unavailable("N/A. The spot feed did not return USD gold and silver.");
    }
    if (typeof gold.price !== "number" || typeof silver.price !== "number" || !(silver.price > 0)) {
      return unavailable("N/A. A spot price was missing.");
    }
    const goldAt = Date.parse(gold.updatedAt ?? "");
    const silverAt = Date.parse(silver.updatedAt ?? "");
    if (!Number.isFinite(goldAt) || !Number.isFinite(silverAt) || Math.abs(goldAt - silverAt) > SPOT_ALIGN_MS) {
      return unavailable("N/A. The gold and silver spot timestamps are more than 30 minutes apart.");
    }
    return {
      value: gold.price / silver.price,
      goldPrice: gold.price,
      silverPrice: silver.price,
      goldAt: new Date(goldAt).toISOString(),
      silverAt: new Date(silverAt).toISOString(),
      sourceLabel: "gold-api.com",
      unavailableReason: null,
      history: pendingHistory,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The spot request failed.";
    return unavailable(`N/A. ${message}`);
  }
}

function loadCopperGold(copper: FrontMonth | null, gold: FrontMonth | null): CopperGoldRatio {
  const base = { copperSymbol: "HG=F", goldSymbol: "GC=F", points: [] as CopperGoldRatio["points"] };
  if (!copper || !gold) {
    return {
      ...base,
      index: null,
      rawRatio: null,
      baseDate: null,
      asOf: null,
      unavailableReason: "N/A. COMEX copper and gold front-month histories were not both available.",
    };
  }
  const index = normalizedRatioIndex(copper.closes, gold.closes, RATIO_WINDOW);
  if (!index) {
    return {
      ...base,
      index: null,
      rawRatio: null,
      baseDate: null,
      asOf: null,
      unavailableReason: `N/A. Fewer than ${COPPER_GOLD_MIN_SESSIONS} sessions have both a copper and a gold close.`,
    };
  }
  return {
    ...base,
    index: index.index,
    rawRatio: index.raw,
    baseDate: index.baseDate,
    asOf: index.asOf,
    points: index.points,
    unavailableReason: null,
  };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function loadCommodityIndicators(now = new Date()): Promise<CommodityIndicators> {
  const today = utcDateDaysFromToday(0, now);
  const emptyLoaded = (spec: HistorySpec): LoadedHistory => ({
    series: null,
    ticker: spec.ticker,
    contractLabel: spec.contractLabel,
    fromAvanza: false,
  });
  const [histories, comexCopper, comexGold, brentWtiLive, goldSilverLive] = await Promise.all([
    mapLimited(HISTORY, 4, async (spec) => {
      try {
        return await loadHistorySeries(spec);
      } catch {
        return emptyLoaded(spec);
      }
    }),
    // Copper/gold ratio stays on COMEX continuous futures — independent of Avanza Price History.
    fetchYahooFuturesHistory("HG=F", "USD").catch(() => null),
    fetchYahooFuturesHistory("GC=F", "USD").catch(() => null),
    loadBrentWti(now),
    loadGoldSilver(),
  ]);

  const historyById = new Map(
    HISTORY.map((spec, index) => [spec.id, histories[index] ?? emptyLoaded(spec)] as const),
  );

  // Brent–WTI history uses the same listed delivery month as the live spread (not BZ=F−CL=F).
  const brentWtiHistory = await loadListedBrentWtiHistory(brentWtiLive);

  const goldHist = historyById.get("gold")?.series?.closes ?? [];
  const silverHist = historyById.get("silver")?.series?.closes ?? [];
  const goldSilverHistory =
    goldHist.length > 0 && silverHist.length > 0
      ? crossMarketHistoryStats(joinRatioSeries(goldHist, silverHist))
      : emptyCrossMarketHistory(
          "Historical analytics unavailable. Gold and silver daily histories were not both available.",
        );

  return {
    brentWti: { ...brentWtiLive, history: brentWtiHistory },
    goldSilver: { ...goldSilverLive, history: goldSilverHistory },
    copperGold: loadCopperGold(comexCopper, comexGold),
    history: HISTORY.map((spec, index) => historyRow(spec, histories[index] ?? emptyLoaded(spec), today)),
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}

/**
 * 1W / 1Y for Brent–WTI from the identical listed pair shown live.
 * Continuous BZ=F−CL=F is not used — fronts can sit on different months than the desk.
 */
async function loadListedBrentWtiHistory(live: BrentWtiSpread): Promise<CrossMarketHistory> {
  if (!live.brentSymbol || !live.wtiSymbol) {
    return emptyCrossMarketHistory(
      "Historical analytics unavailable. Live listed Brent/WTI contracts were not resolved.",
    );
  }
  const [brentHist, wtiHist] = await Promise.all([
    fetchYahooFuturesHistory(live.brentSymbol, "USD", { includeToday: true }).catch(() => null),
    fetchYahooFuturesHistory(live.wtiSymbol, "USD", { includeToday: true }).catch(() => null),
  ]);
  if (!brentHist || !wtiHist) {
    return emptyCrossMarketHistory(
      `Historical analytics unavailable. Daily history for ${live.brentSymbol} and ${live.wtiSymbol} was not both available.`,
    );
  }
  return crossMarketHistoryStats(joinSpreadSeries(brentHist.closes, wtiHist.closes));
}
