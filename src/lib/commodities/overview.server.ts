import {
  AVANZA_COMMODITY_LABELS,
  AVANZA_COMMODITY_UNITS,
  fetchAvanzaCommodityChart,
  fetchAvanzaCommodityQuote,
  type AvanzaCommodityId,
} from "./avanzaCommodityHistory";
import {
  calendarDaysBetween,
  parseWestmetallCash,
  percentChange,
  trimChart,
  utcDateDaysFromToday,
  type CommodityGroupId,
  type CommodityKind,
  type CommodityOverview,
  type CommodityPoint,
  type CommodityQuote,
} from "./overview";
import { nordicCalendarChangePct, stockholmDateOffset } from "./nordicSysCalendar";
import { fetchNordicSysDailyHistory } from "./nordicSysHistory";

const FETCH_TIMEOUT_MS = 12_000;
const FUTURES_STALE_DAYS = 4;
const LME_STALE_DAYS = 5;
const POWER_STALE_DAYS = 1;
/** Continuous Avanza retail indexes — mark stale when last tick is older than this. */
const AVANZA_STALE_MS = 36 * 60 * 60 * 1000;

type QuoteBase = {
  id: string;
  name: string;
  group: CommodityGroupId;
  kind: CommodityKind;
  contractLabel: string;
};

function unavailable(base: QuoteBase, reason: string): CommodityQuote {
  return {
    ...base,
    price: null,
    unit: null,
    changePercent1d: null,
    changeNote: null,
    asOf: null,
    sourceLabel: null,
    chart: [],
    chartLabel: null,
    historyNote: null,
    unavailableReason: reason,
    stale: false,
  };
}

function sessionDateFromUnix(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

type YahooBar = { date: string; close: number };

function priorSessionClose(sessionDate: string, bars: YahooBar[]): number | null {
  let previous: number | null = null;
  for (const bar of bars) {
    if (bar.date < sessionDate) previous = bar.close;
  }
  return previous;
}

type YahooSpec = QuoteBase & {
  symbol: string;
  unit: string;
  currency: string;
  chartLabel: string;
};

async function fetchYahoo(spec: YahooSpec): Promise<CommodityQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.symbol)}?interval=1d&range=1y`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return unavailable(spec, `Yahoo returned HTTP ${res.status} for ${spec.symbol}.`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        meta?: {
          instrumentType?: string;
          currency?: string;
          shortName?: string;
          exchangeName?: string;
          regularMarketPrice?: number;
          regularMarketTime?: number;
        };
      }>;
      error?: { description?: string };
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  if (!result || !meta) {
    return unavailable(spec, json.chart?.error?.description ?? `Yahoo has no data for ${spec.symbol}.`);
  }
  if (meta.instrumentType !== "FUTURE") {
    return unavailable(spec, `${spec.symbol} was not a futures contract (${meta.instrumentType ?? "unknown"}).`);
  }
  if (meta.currency !== spec.currency) {
    return unavailable(
      spec,
      `${spec.symbol} was quoted in ${meta.currency ?? "an unknown currency"}, not ${spec.currency}.`,
    );
  }

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars: YahooBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    const ts = timestamps[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0 && typeof ts === "number") {
      bars.push({ date: sessionDateFromUnix(ts), close });
    }
  }

  const live = meta.regularMarketPrice;
  const lastBar = bars[bars.length - 1];
  const price = typeof live === "number" && Number.isFinite(live) && live > 0 ? live : lastBar?.close ?? null;
  if (price == null) return unavailable(spec, `Yahoo returned no price for ${spec.symbol}.`);

  const marketTime = typeof meta.regularMarketTime === "number" ? meta.regularMarketTime : null;
  const sessionDate = marketTime != null ? sessionDateFromUnix(marketTime) : lastBar?.date ?? null;
  const previous = sessionDate ? priorSessionClose(sessionDate, bars) : null;
  const age = sessionDate ? calendarDaysBetween(sessionDate, utcDateDaysFromToday(0)) : null;
  const feedName = meta.shortName?.trim();
  const exchange = meta.exchangeName?.trim();

  return {
    ...spec,
    price,
    unit: spec.unit,
    changePercent1d: previous == null ? null : percentChange(price, previous),
    changeNote: previous == null ? "1-day change is unavailable because the prior session close was missing." : null,
    asOf: marketTime != null ? new Date(marketTime * 1000).toISOString() : sessionDate,
    sourceLabel: exchange ? `Yahoo · ${exchange}` : "Yahoo",
    contractLabel: feedName ? `${spec.contractLabel} Feed name: ${feedName}.` : spec.contractLabel,
    chart: trimChart(bars.map((bar) => ({ date: bar.date, price: bar.close }))),
    chartLabel: bars.length >= 10 ? spec.chartLabel : null,
    historyNote:
      bars.length >= 10 ? null : "No chart: the feed did not return enough daily history for this contract.",
    unavailableReason: null,
    stale: age == null || age > FUTURES_STALE_DAYS,
  };
}

type AvanzaSpec = QuoteBase & {
  avanzaId: AvanzaCommodityId;
  unit: string;
};

/**
 * Unified Avanza series for Last, 1D%, and chart history.
 * Never mixes Yahoo futures or gold-api spot into these five instruments.
 */
async function fetchAvanzaCommodity(spec: AvanzaSpec): Promise<CommodityQuote> {
  const labels = AVANZA_COMMODITY_LABELS[spec.avanzaId];
  const [quote, chart] = await Promise.all([
    fetchAvanzaCommodityQuote(spec.avanzaId),
    fetchAvanzaCommodityChart(spec.avanzaId),
  ]);
  if (!quote) {
    return unavailable(
      { ...spec, contractLabel: labels.contractLabel },
      `Avanza did not return a verified Last price for ${labels.ticker}.`,
    );
  }

  const calculated =
    quote.previousClose != null ? percentChange(quote.last, quote.previousClose) : null;
  let changeNote: string | null = null;
  if (quote.changePercent1d == null) {
    changeNote = "1-day change is unavailable because Avanza did not publish a prior close.";
  } else if (
    calculated != null &&
    Math.abs(calculated - quote.changePercent1d) > 0.25
  ) {
    // Still use Avanza's published 1D%; flag the mismatch for the tooltip.
    changeNote = `Avanza 1D% ${quote.changePercent1d.toFixed(2)} (from Last vs previous close would be ${calculated.toFixed(2)}).`;
  }

  const asOfMs = quote.asOf ? Date.parse(quote.asOf) : NaN;
  const stale = !Number.isFinite(asOfMs) || Date.now() - asOfMs > AVANZA_STALE_MS;

  return {
    ...spec,
    contractLabel: labels.contractLabel,
    price: quote.last,
    unit: spec.unit,
    changePercent1d: quote.changePercent1d,
    changeNote,
    asOf: quote.asOf,
    sourceLabel: "Avanza",
    chart,
    chartLabel: chart.length >= 10 ? "Avanza daily closes" : null,
    historyNote:
      chart.length >= 10
        ? null
        : "No chart: Avanza did not return enough daily history for this index.",
    unavailableReason: null,
    stale,
  };
}

type LmeSpec = QuoteBase & { field: string; header: string; unit: string };

/** Current + prior calendar year covers a full 1Y trading window (YTD alone is often <252 sessions). */
const LME_HISTORY_YEARS = 2;

function mergeCommodityPoints(batches: CommodityPoint[][]): CommodityPoint[] {
  const byDate = new Map<string, number>();
  for (const batch of batches) {
    for (const point of batch) {
      if (Number.isFinite(point.price) && point.price > 0) byDate.set(point.date, point.price);
    }
  }
  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchWestmetallYear(
  field: string,
  header: string,
  year: number,
): Promise<CommodityPoint[] | null> {
  const url = `https://www.westmetall.com/en/markdaten.php?action=table&field=${field}&year=${year}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  return parseWestmetallCash(await res.text(), header);
}

async function fetchLmeCash(spec: LmeSpec): Promise<CommodityQuote> {
  const yearNow = new Date().getUTCFullYear();
  const years = Array.from({ length: LME_HISTORY_YEARS }, (_, i) => yearNow - i);
  const batches = await Promise.all(years.map((year) => fetchWestmetallYear(spec.field, spec.header, year)));
  const points = mergeCommodityPoints(batches.filter((batch): batch is CommodityPoint[] => batch != null));
  if (points.length < 2) {
    return unavailable(spec, "LME cash-settlement table did not include a usable price.");
  }
  const latest = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const age = calendarDaysBetween(latest.date, utcDateDaysFromToday(0));
  return {
    ...spec,
    price: latest.price,
    unit: spec.unit,
    changePercent1d: percentChange(latest.price, previous.price),
    changeNote: null,
    asOf: latest.date,
    sourceLabel: "Westmetall · LME cash settlement",
    chart: trimChart(points),
    chartLabel: points.length >= 10 ? "LME cash settlement" : null,
    historyNote: points.length >= 10 ? null : "No chart: the settlement table did not include enough history.",
    unavailableReason: null,
    stale: age == null || age > LME_STALE_DAYS,
  };
}

const NORDIC_BASE: QuoteBase = {
  id: "nordic-power",
  name: "Nordic Power",
  group: "energy",
  kind: "benchmark",
  contractLabel:
    "Nord Pool day-ahead system price (SYS), daily average in EUR/MWh. This is the auction for the delivery date, not a continuous intraday trade.",
};

/**
 * Free Nord Pool DayAheadPrices returns SYS without auth only for a short recent window
 * (older dates → HTTP 401). History is merged into a durable cache; do not substitute
 * bidding-zone series (SE3/NO1/etc.) for the Nordic system price.
 */
async function fetchNordicPower(): Promise<CommodityQuote> {
  const bars = await fetchNordicSysDailyHistory();
  const points: CommodityPoint[] = bars.map((bar) => ({ date: bar.date, price: bar.close }));
  if (points.length === 0) {
    return unavailable(NORDIC_BASE, "Nord Pool did not return a recent system price.");
  }
  const latest = points[points.length - 1]!;
  const priorDate = stockholmDateOffset(latest.date, -1);
  const changePercent1d = nordicCalendarChangePct(points, "1D");
  const age = calendarDaysBetween(latest.date, utcDateDaysFromToday(0));
  const chartPoints = trimChart(points);
  return {
    ...NORDIC_BASE,
    price: latest.price,
    unit: "EUR/MWh",
    changePercent1d,
    changeNote:
      changePercent1d == null
        ? `1-day change is unavailable: no SYS price for delivery ${priorDate}.`
        : null,
    asOf: latest.date,
    sourceLabel: "Nord Pool",
    chart: chartPoints,
    chartLabel: chartPoints.length >= 10 ? "Day-ahead system average" : null,
    historyNote:
      chartPoints.length >= 10
        ? null
        : "No chart: Nord Pool did not return enough delivery days for a history. The free Day-ahead API only exposes a short recent window.",
    unavailableReason: null,
    stale: age == null || age > POWER_STALE_DAYS,
  };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

function avanzaSpec(
  id: AvanzaCommodityId,
  name: string,
  group: CommodityGroupId,
  kind: CommodityKind,
): AvanzaSpec {
  return {
    id,
    name,
    group,
    kind,
    avanzaId: id,
    unit: AVANZA_COMMODITY_UNITS[id],
    contractLabel: AVANZA_COMMODITY_LABELS[id].contractLabel,
  };
}

const AVANZA_BRENT = avanzaSpec("brent", "Brent Crude", "energy", "benchmark");
const AVANZA_WTI = avanzaSpec("wti", "WTI Crude", "energy", "benchmark");
const AVANZA_NATGAS = avanzaSpec("henry-hub", "Natural Gas", "energy", "benchmark");
const AVANZA_GOLD = avanzaSpec("gold", "Gold", "metals", "spot");
const AVANZA_SILVER = avanzaSpec("silver", "Silver", "metals", "spot");

const TTF_YAHOO: YahooSpec = {
  id: "ttf",
  name: "TTF Natural Gas",
  group: "energy",
  kind: "futures",
  symbol: "TTF=F",
  unit: "EUR/MWh",
  currency: "EUR",
  chartLabel: "Yahoo daily bars",
  contractLabel:
    "NYMEX Dutch TTF natural gas futures, EUR per MWh. Futures price, not a spot index. Yahoo labels this listing “Calendar”.",
};

const AGRICULTURE: YahooSpec[] = [
  {
    id: "wheat",
    name: "Wheat",
    group: "agriculture",
    kind: "futures",
    symbol: "ZW=F",
    unit: "USc/bu",
    currency: "USX",
    chartLabel: "Yahoo daily bars",
    contractLabel: "CBOT Chicago SRW wheat futures, US cents per bushel. The feed currency is USX (cents), not dollars.",
  },
  {
    id: "corn",
    name: "Corn",
    group: "agriculture",
    kind: "futures",
    symbol: "ZC=F",
    unit: "USc/bu",
    currency: "USX",
    chartLabel: "Yahoo daily bars",
    contractLabel: "CBOT corn futures, US cents per bushel. The feed currency is USX (cents), not dollars.",
  },
];

const LME: LmeSpec[] = [
  {
    id: "copper",
    name: "Copper",
    group: "metals",
    kind: "benchmark",
    field: "LME_Cu_cash",
    header: "LME Copper Cash-Settlement",
    unit: "USD/t",
    contractLabel:
      "LME copper cash settlement, USD per metric tonne. Official settlement, not the 3-month forward and not COMEX.",
  },
  {
    id: "aluminium",
    name: "Aluminium",
    group: "metals",
    kind: "benchmark",
    field: "LME_Al_cash",
    header: "LME Aluminium Cash-Settlement",
    unit: "USD/t",
    contractLabel:
      "LME aluminium cash settlement, USD per metric tonne. Official settlement, not the 3-month forward and not COMEX.",
  },
  {
    id: "nickel",
    name: "Nickel",
    group: "metals",
    kind: "benchmark",
    field: "LME_Ni_cash",
    header: "LME Nickel Cash-Settlement",
    unit: "USD/t",
    contractLabel:
      "LME nickel cash settlement, USD per metric tonne. Official settlement, not the 3-month forward.",
  },
];

async function settle(base: QuoteBase, run: () => Promise<CommodityQuote>): Promise<CommodityQuote> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : "The price request failed.";
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : err instanceof Error && err.cause && typeof err.cause === "object" && "code" in err.cause
          ? String((err.cause as { code?: unknown }).code)
          : null;
    return unavailable(base, cause ? `${message} (${cause})` : message);
  }
}

export async function loadCommodityOverview(): Promise<CommodityOverview> {
  // Desk order: Brent, WTI, TTF, Nat Gas, Nordic · Gold, Silver, LME · Wheat, Corn.
  const quotes = await Promise.all([
    settle(AVANZA_BRENT, () => fetchAvanzaCommodity(AVANZA_BRENT)),
    settle(AVANZA_WTI, () => fetchAvanzaCommodity(AVANZA_WTI)),
    settle(TTF_YAHOO, () => fetchYahoo(TTF_YAHOO)),
    settle(AVANZA_NATGAS, () => fetchAvanzaCommodity(AVANZA_NATGAS)),
    settle(NORDIC_BASE, fetchNordicPower),
    settle(AVANZA_GOLD, () => fetchAvanzaCommodity(AVANZA_GOLD)),
    settle(AVANZA_SILVER, () => fetchAvanzaCommodity(AVANZA_SILVER)),
    ...LME.map((spec) => settle(spec, () => fetchLmeCash(spec))),
    ...AGRICULTURE.map((spec) => settle(spec, () => fetchYahoo(spec))),
  ]);

  return {
    quotes,
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}
