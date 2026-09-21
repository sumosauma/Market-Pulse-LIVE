import { createServerFn } from "@tanstack/react-start";
import { EQUITY_1M_TRADING_DAYS } from "@/lib/equities/equityDayChange";
import {
  fetchDiInstrumentHistory,
  normalizeDiPointsToDailyEod,
  trimRowsToLookback,
} from "@/lib/di/diInstrumentHistory";
import { MARKETS_QUERY_KEY, normalizeMarketDate } from "@/lib/markets/quoteMeta";

export { MARKETS_QUERY_KEY };

export interface HistoryPoint {
  date: string;
  price: number;
}

export type QuoteDataKind = "intraday" | "EOD" | "reference" | "delayed";

export interface Quote {
  symbol: string;
  label: string;
  category: string;
  unit?: string;
  /** Human-readable source, e.g. `FRED EOD`, `ECB ref`, `CBOE prior close`. */
  sourceLabel?: string;
  /** Latest observation date (ISO `YYYY-MM-DD` when known). */
  observationDate?: string;
  dataKind?: QuoteDataKind;
  /** True when price is replayed from an expired in-memory cache after fetch failure. */
  fromStaleCache?: boolean;
  // Displayed card price. For Gold when using GC=F fallback this is the live spot
  // price; changePercent/5d are still calculated from the GC=F calculation price.
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  // 6 points (oldest → newest) used solely for 5D performance calculation.
  history: HistoryPoint[];
  // Richer series for the sparkline — separate from `history`.
  // Intraday (30 m) for Yahoo tickers; daily (20–30 pts) for EOD sources.
  // Falls back to `history` in the UI when absent.
  chartData?: HistoryPoint[];
  change5d: number | null;
  changePercent5d: number | null;
  /** Absolute change vs ~21 sessions ago — yield units for rates, price units otherwise. */
  change1m: number | null;
  changePercent1m: number | null;
  /** Absolute change vs ~252 sessions ago — yield units for rates, price units otherwise. */
  change1y: number | null;
  changePercent1y: number | null;
  range5d: { min: number; max: number } | null;
  // Positive = consecutive up sessions, negative = down, 0 = flat/mixed
  streak: number | null;
  // Intraday day range — available for Yahoo/GC=F sources; null for EOD-only sources.
  low: number | null;
  high: number | null;
  error?: string;
}

type Source = "yahoo" | "fred" | "riksbank" | "di" | "cnn" | "cboe" | "frankfurter" | "stooq" | "goldspot";

interface TickerDef {
  symbol: string;
  label: string;
  category: string;
  unit?: string;
  source: Source;
  fredId?: string;
  riksbankId?: string;
  /** DI/Millistream instrument reference (di.se). */
  diInsref?: string;
  cboeFile?: string;
  fxFrom?: string;
  fxTo?: string;
  stooqSymbol?: string;
  // Stooq fallback when primary source fails (reuses stooqSymbol field)
  // FRED fallback when primary source fails
  fredFallbackId?: string;
  // CBOE CSV fallback when primary source fails (e.g. VIX Yahoo → CBOE EOD).
  cboeFallbackFile?: string;
  // Alpha Vantage fallback
  avFn?: "GLOBAL_QUOTE" | "CURRENCY_EXCHANGE_RATE";
  avSymbol?: string;
  avFrom?: string;
  avTo?: string;
  // When set, a supplemental Yahoo v8/chart fetch is fired in parallel with the
  // primary source fetch purely to obtain regularMarketDayLow/High.
  // Has no effect on price, previousClose, history, Today% or 5D%.
  yahooLhSymbol?: string;
}

const TICKERS: TickerDef[] = [
  // --- Rates ---
  // Primary: Yahoo ^TNX (intraday yield). Fallback: FRED DGS10 (daily constant maturity).
  {
    symbol: "^TNX",
    label: "US 10Y Yield",
    category: "Rates",
    unit: "%",
    source: "yahoo",
    fredFallbackId: "DGS10",
  },
  { symbol: "DGS2", label: "US 2Y Yield", category: "Rates", unit: "%", source: "fred", fredId: "DGS2" },
  {
    symbol: "SEGVB10YC",
    label: "Sweden 10Y Yield",
    category: "Rates",
    unit: "%",
    source: "di",
    diInsref: "33383",
  },
  {
    symbol: "SEGVB2YC",
    label: "Sweden 2Y Yield",
    category: "Rates",
    unit: "%",
    source: "di",
    diInsref: "33381",
  },

  // --- Equities ---
  // ^OMX: Primary Yahoo. No AV fallback — AV does not carry the OMXS30 index.
  // No other free source available. Will show ERR when Yahoo is 429-blocked.
  { symbol: "^OMX", label: "OMX Stockholm 30", category: "Equities", source: "yahoo" },
  // ^GSPC: Primary Yahoo (live index). Fallback: FRED SP500, then AV GLOBAL_QUOTE.
  { symbol: "^GSPC", label: "S&P 500", category: "Equities", source: "yahoo", fredFallbackId: "SP500", avFn: "GLOBAL_QUOTE", avSymbol: "^GSPC" },

  // --- Inflation ---
  { symbol: "T10YIE", label: "US 10Y Breakeven", category: "Inflation", unit: "%", source: "fred", fredId: "T10YIE" },
  // Primary: Yahoo futures. Fallback: FRED EIA daily spot (1–2 day lag).
  { symbol: "BZ=F", label: "Brent Crude", category: "Inflation", unit: "USD/bbl", source: "yahoo", fredFallbackId: "DCOILBRENTEU" },
  // Gold Spot XAU/USD — hybrid source:
  //   live price : gold-api.com (free, unlimited, no API key)
  //   history    : Stooq XAUUSD (free latest tick; daily history if API key available)
  // This is spot gold, NOT GC futures.
  { symbol: "GC=F", label: "Gold Spot", category: "Inflation", unit: "USD/oz", source: "goldspot" },

  // --- Forex ---
  // DX-Y.NYB: No free alternative for the DXY trade-weighted index.
  // None of FRED / Riksbank / Frankfurter / CBOE / AV carry this index.
  // Keep Yahoo — will show ERR when 429-blocked.
  { symbol: "DX-Y.NYB", label: "US Dollar Index", category: "Forex", source: "yahoo" },
  // USD/SEK and EUR/SEK switched to Frankfurter (free, no auth, history included).
  { symbol: "SEK=X", label: "USD/SEK", category: "Forex", source: "frankfurter", fxFrom: "USD", fxTo: "SEK" },
  { symbol: "EURSEK=X", label: "EUR/SEK", category: "Forex", source: "frankfurter", fxFrom: "EUR", fxTo: "SEK" },

  // --- Volatility ---
  // VIX: Yahoo intraday for live monitor; CBOE prior close as fallback.
  { symbol: "^VIX", label: "VIX Index", category: "Volatility", source: "yahoo", cboeFallbackFile: "VIX_History.csv" },
  { symbol: "^SKEW", label: "SKEW Index", category: "Volatility", source: "cboe", cboeFile: "SKEW_History.csv" },
  { symbol: "FEARGREED", label: "Fear & Greed Index", category: "Volatility", source: "cnn" },
];

/** Riksbank SWEA IDs */
const SWEDEN_10Y_RIKSBANK_SERIES_ID = "SEGVB10YC" as const;

/**
 * Fallback when SWEA + disk cache unavailable: OECD Main Economic Indicators (monthly %) via FRED.
 * Units: percent, not seasonally adjusted. Not daily — uses consecutive published observations.
 */
const SWEDEN_10Y_FRED_MONTHLY_SERIES = "IRLTLT01SEM156N" as const;

// Used by non-Yahoo fetchers (Frankfurter, CBOE, Riksbank, CNN).
// NOT used for Yahoo — browser UAs trigger Yahoo's server-side bot filter (429).
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const FETCH_TIMEOUT_MS = 8_000;

function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// Diagnostic test proved: Yahoo v8/finance/chart works with NO crumb, NO cookie, NO special headers.
// The crumb endpoint (v1/test/getcrumb) returns 401/429 and is not needed for chart data.

type CacheEntry = { quote: Quote; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

// Separate long-lived cache for Alpha Vantage GOLD_SILVER_HISTORY.
// AV free tier: 25 requests/day. Daily closes are fixed once the trading day ends, so a
// 24-hour TTL triggers at most 1 AV request per server process lifetime (per day).
// Manual dashboard Refresh does NOT bypass this cache — it only refreshes gold-api.com price.
const AV_GOLD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 86_400_000 ms — 24 hours

// Persistent file cache path — survives dev server restarts (Node.js only; silently skipped
// on Cloudflare Workers which has no filesystem).
const AV_GOLD_CACHE_FILE = "data/cache/gold-av-daily.json";

type AvGoldEntry = {
  data: { date: string; price: string }[];
  expires: number;
  source: "fresh-av" | "persistent-file";
};
let avGoldCache: AvGoldEntry | null = null;
// Backoff timer — prevents AV retries without wiping the cached data rows.
// Set to now+6h when AV returns a quota error.
let avGoldBackoffUntil = 0;

/** Write AV rows to disk so they survive a dev server restart (Node.js only). */
function savePersistentGoldCache(rows: { date: string; price: string }[]): void {
  try {
    // Dynamic require keeps the import tree clean and avoids Cloudflare Workers errors.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(AV_GOLD_CACHE_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      AV_GOLD_CACHE_FILE,
      JSON.stringify({ rows, savedAt: new Date().toISOString(), source: "alpha-vantage" }, null, 2),
      "utf8",
    );
    console.log(`[GoldSpot][persistent-cache] saved ${rows.length} rows → ${AV_GOLD_CACHE_FILE}`);
  } catch (e) {
    // Expected on Cloudflare Workers (no fs) — not an error.
    console.log(`[GoldSpot][persistent-cache] write skipped (${e instanceof Error ? e.message : "no fs"})`);
  }
}

// On server startup, pre-load the persistent file cache into avGoldCache so Gold history
// is immediately available even when AV quota is exhausted after a dev server restart.
// Runs once synchronously at module load time (Node.js only; silently skipped on Workers).
(function initGoldPersistentCache() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(AV_GOLD_CACHE_FILE)) return;
    const raw = readFileSync(AV_GOLD_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { rows: { date: string; price: string }[]; savedAt: string };
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return;
    const savedAt = new Date(parsed.savedAt).getTime();
    const expires = savedAt + AV_GOLD_CACHE_TTL_MS;
    avGoldCache = { data: parsed.rows, expires, source: "persistent-file" };
    const ageH = Math.round((Date.now() - savedAt) / 3_600_000);
    const willRefresh = expires <= Date.now();
    console.log(
      `[GoldSpot][init] loaded persistent cache: ${parsed.rows.length} rows` +
      ` savedAt=${parsed.savedAt} age=${ageH}h` +
      ` → ${willRefresh ? "EXPIRED — will attempt AV refresh on first request" : "FRESH — AV fetch skipped until cache expires"}`,
    );
  } catch {
    // Cloudflare Workers / file not found / JSON corrupt — silently ignored.
  }
})();

interface RawData {
  // Price used for changePercent / changePercent5d calculations.
  // For the GC=F fallback Gold path this is the GC=F latest price (futures).
  price: number;
  // When set, overrides the displayed card number (e.g. live spot when % uses futures).
  displayPrice?: number;
  previousClose: number | null;
  history: HistoryPoint[];
  /** Extended daily series for 1M stats — not sent to client; server-side only. */
  metricsSeries?: HistoryPoint[];
  /** Prevent session-based 1Y on low-frequency fallback series (e.g. monthly OECD). */
  metricsCadence?: "daily" | "monthly";
  // Optional richer chart series — intraday or extended daily.
  chartData?: HistoryPoint[];
  // Intraday day range — sourced from Yahoo meta.regularMarketDayLow/High.
  // null for EOD-only sources (FRED, Riksbank, Frankfurter, CBOE, CNN).
  low?: number | null;
  high?: number | null;
  sourceLabel?: string;
  observationDate?: string;
  dataKind?: QuoteDataKind;
}

// LAST_RESORT_SNAPSHOT removed — hardcoded prices must not be shown as live data.

function takeLast<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Preserves the visual shape of the series — peaks, troughs, jumps — while
 * reducing point count to `threshold`. Always keeps first and last points.
 * Uses array indices as x-coordinates (uniform time assumed).
 */
function lttb(data: HistoryPoint[], threshold: number): HistoryPoint[] {
  const n = data.length;
  if (n <= threshold) return data;

  const result: HistoryPoint[] = [data[0]];
  const bucketSize = (n - 2) / (threshold - 2);
  let prevIdx = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Current bucket range
    const curStart = Math.floor((i + 1) * bucketSize) + 1;
    const curEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1);

    // Average of next bucket (used as the "future" reference point)
    const nextStart = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1);
    const nextEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, n - 1);
    let avgX = 0, avgY = 0, cnt = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += j;
      avgY += data[j].price;
      cnt++;
    }
    if (cnt === 0) { avgX = nextStart; avgY = data[nextStart].price; }
    else { avgX /= cnt; avgY /= cnt; }

    // Pick the point in curBucket that forms the largest triangle with prevIdx → avg
    let maxArea = -1;
    let selectedIdx = curStart;
    const ax = prevIdx, ay = data[prevIdx].price;
    for (let j = curStart; j < curEnd; j++) {
      const area = Math.abs((ax - avgX) * (data[j].price - ay) - (ax - j) * (avgY - ay)) * 0.5;
      if (area > maxArea) { maxArea = area; selectedIdx = j; }
    }
    result.push(data[selectedIdx]);
    prevIdx = selectedIdx;
  }

  result.push(data[n - 1]);
  return result;
}

type YahooChartJson = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: unknown;
        chartPreviousClose?: unknown;
        previousClose?: unknown;
        regularMarketDayLow?: unknown;
        regularMarketDayHigh?: unknown;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string };
  };
};

/**
 * Yahoo ^TNX: v8/chart usually returns yield in percent (e.g. 4.57).
 * Legacy/display quotes use yield×10 (e.g. 45.70 → 4.570%). Scale only when clearly ×10.
 */
function normalizeYahooTnxYield(raw: number): number {
  return raw > 30 ? raw / 10 : raw;
}

/** Yahoo ^TNX daily series stale or meta price inconsistent with last daily close. */
function isYahooTnxHistoryStale(data: RawData): boolean {
  const lastDaily = data.metricsSeries?.at(-1)?.date ?? data.history.at(-1)?.date;
  if (!lastDaily) return true;
  const ageDays = (Date.now() - new Date(`${lastDaily}T16:00:00Z`).getTime()) / 86_400_000;
  if (ageDays > 3) return true;
  const lastClose = data.metricsSeries?.at(-1)?.price ?? data.history.at(-1)?.price;
  if (lastClose != null && Math.abs(data.price - lastClose) > 0.05) return true;
  return false;
}

/**
 * US 10Y: Yahoo ^TNX when daily history is fresh; otherwise FRED DGS10 for level
 * (Yahoo intraday chart may still supplement sparkline).
 */
async function fetchUs10YYield(): Promise<RawData> {
  let yahooData: RawData | null = null;
  try {
    yahooData = await fetchYahoo("^TNX");
    const lastDaily = yahooData.metricsSeries?.at(-1)?.date ?? yahooData.history.at(-1)?.date ?? "n/a";
    if (!isYahooTnxHistoryStale(yahooData)) {
      console.log(`[^TNX] Yahoo fresh — level from Yahoo (lastDaily=${lastDaily})`);
      return yahooData;
    }
    console.log(`[^TNX] Yahoo stale/inconsistent (lastDaily=${lastDaily}) — FRED DGS10 for level`);
  } catch (e) {
    console.log(`[^TNX] Yahoo failed — FRED DGS10: ${e instanceof Error ? e.message : e}`);
  }
  const fred = await fetchFred("DGS10");
  if (yahooData) {
    return {
      ...fred,
      chartData: yahooData.chartData ?? fred.chartData,
      low: yahooData.low ?? fred.low,
      high: yahooData.high ?? fred.high,
    };
  }
  return fred;
}

function scaleYahooTnxRawData(data: RawData): RawData {
  const scale = normalizeYahooTnxYield;
  const scalePoint = (p: HistoryPoint): HistoryPoint => ({ ...p, price: scale(p.price) });
  return {
    ...data,
    price: scale(data.price),
    previousClose: data.previousClose !== null ? scale(data.previousClose) : null,
    history: data.history.map(scalePoint),
    metricsSeries: data.metricsSeries?.map(scalePoint),
    chartData: data.chartData?.map(scalePoint),
    low: data.low != null ? scale(data.low) : data.low,
    high: data.high != null ? scale(data.high) : data.high,
  };
}

async function fetchYahoo(symbol: string): Promise<RawData> {
  // No crumb, no cookie, no browser UA — diagnostic proved bare requests get 200.
  // Sending a Chrome User-Agent from server-side triggers Yahoo's bot filter (429).
  // 1M performance needs >= 22 daily closes (baseline 21 sessions back). Some symbols
  // return only ~21 bars for range=1mo, so we used 2mo for reliability.
  // 1Y needs strict >= 253 observations (252 sessions back + endpoint), and `range=1y`
  // can return only 252 bars. Use 2y for metricsSeries depth while keeping intraday
  // 30m/5d sparkline unchanged.
  const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`;
  const intradayUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=30m&range=5d`;
  console.log(`[DIAG][Yahoo][${symbol}] GET daily+intraday(30m) at ${new Date().toISOString()}`);

  // Fetch both in parallel — daily for price/previousClose/history, intraday for chartData
  const [dailyResult, intradayResult] = await Promise.allSettled([
    timedFetch(dailyUrl),
    timedFetch(intradayUrl),
  ]);

  if (dailyResult.status === "rejected" || !dailyResult.value.ok) {
    const err = dailyResult.status === "rejected" ? String(dailyResult.reason) : `Yahoo HTTP ${dailyResult.value.status}`;
    throw new Error(err);
  }
  console.log(`[DIAG][Yahoo][${symbol}] daily=${dailyResult.value.status}`);

  const json = (await dailyResult.value.json()) as YahooChartJson;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? "No data");
  const meta = result.meta ?? {};
  const price = meta.regularMarketPrice;
  if (typeof price !== "number") throw new Error("No price");

  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: HistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") {
      points.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), price: c });
    }
  }
  // Keep 6 points: h[0] = 5 sessions ago (5d baseline), h[5] = today's live session.
  const history = takeLast(points, 6);

  // meta.chartPreviousClose = close at START of the chart range window (~10 days ago) — NOT yesterday.
  // meta.previousClose is absent for Yahoo futures/indices on this endpoint.
  // Derive true previous session close from the close series directly:
  //   - If the last bar is today's in-progress session → previous close = second-to-last bar.
  //   - If the last bar is a completed day (market closed / pre-market) → it IS the previous close.
  const allValidCloses = points.map((p) => p.price);
  const lastBarDate = points[points.length - 1]?.date ?? "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const previousClose: number | null =
    lastBarDate === todayStr
      ? (allValidCloses[allValidCloses.length - 2] ?? null)
      : (allValidCloses[allValidCloses.length - 1] ?? null);

  // ── Intraday chartData (30 m × 5 d ≈ 65–150 raw pts → LTTB → 75) ──────────
  let chartData: HistoryPoint[] | undefined;
  if (intradayResult.status === "fulfilled" && intradayResult.value.ok) {
    const ij = (await intradayResult.value.json()) as YahooChartJson;
    const ir = ij?.chart?.result?.[0];
    if (ir) {
      const its = ir.timestamp ?? [];
      const ic = ir.indicators?.quote?.[0]?.close ?? [];
      const rawPts: HistoryPoint[] = [];
      for (let i = 0; i < its.length; i++) {
        const v = ic[i];
        if (typeof v === "number") {
          rawPts.push({ date: new Date(its[i] * 1000).toISOString().slice(0, 16), price: v });
        }
      }
      chartData = lttb(rawPts, 75);
      console.log(`[DIAG][Yahoo][${symbol}] intraday 30m: ${rawPts.length} raw → LTTB → ${chartData.length} chartData pts`);
    }
  } else {
    const iErr = intradayResult.status === "rejected" ? String(intradayResult.reason) : `HTTP ${intradayResult.value?.status}`;
    console.log(`[DIAG][Yahoo][${symbol}] intraday fetch failed (${iErr}) — sparkline will fall back to daily history`);
  }

  const low  = typeof meta.regularMarketDayLow  === "number" ? meta.regularMarketDayLow  : null;
  const high = typeof meta.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : null;

  console.log(
    `[DIAG][Yahoo][${symbol}] parsed OK — price=${price} previousClose=${previousClose} ` +
    `(from hist-${lastBarDate === todayStr ? "2" : "1"}) historyPoints=${history.length} chartPts=${chartData?.length ?? "n/a (fallback)"} ` +
    `low=${low} high=${high}`
  );
  const raw: RawData = {
    price,
    previousClose,
    history,
    metricsSeries: points,
    metricsCadence: "daily",
    chartData,
    low,
    high,
    sourceLabel: "Yahoo",
    observationDate: lastBarDate || todayStr,
    dataKind: "intraday",
  };
  if (symbol === "^TNX") {
    const scaled = scaleYahooTnxRawData(raw);
    console.log(
      `[DIAG][Yahoo][^TNX] normalized yield — raw=${price} display=${scaled.price} prev=${scaled.previousClose}`,
    );
    return scaled;
  }
  return raw;
}

// Gold Spot hybrid fetcher — XAU/USD
//   Live price  : gold-api.com (free, unlimited, no API key)
//   History     : Stooq XAUUSD latest tick (Open → previousClose proxy) +
//                 Stooq daily history (5-day closes, requires API key — gracefully skipped)
// Fallback chain:
//   - If gold-api.com fails  → use Stooq Close as live price
//   - If Stooq history fails → show live price with no daily/5d change
//   - If both fail           → throw so fetchOne can use stale cache or show ERR
async function fetchGoldSpot(): Promise<RawData> {
  // Sources:
  //  - gold-api.com      : real-time XAU/USD spot price, free + unlimited, no key
  //  - Stooq XAUUSD      : intraday close, free — used as price fallback ONLY, never previousClose
  //  - AV GOLD_SILVER_HISTORY : true daily closes (newest-first), ALPHA_VANTAGE_API_KEY required
  //    → cached 6h so ~4 AV requests/day stay inside the 25 req/day free quota

  const avKey = process.env.ALPHA_VANTAGE_API_KEY ?? "";
  const now = Date.now();

  // Cache state
  const cacheHasData = avGoldCache !== null && avGoldCache.data.length > 0;
  const cacheFresh    = cacheHasData && avGoldCache!.expires > now;
  const avBackoff     = now < avGoldBackoffUntil;
  // Attempt AV if: key set AND no rate-limit backoff AND cache isn't fresh
  const needAvFetch   = avKey !== "" && !avBackoff && !cacheFresh;

  // Log cache/backoff state before any network I/O
  if (cacheFresh) {
    console.log(
      `[GoldSpot][av-history] cache HIT source=${avGoldCache!.source}` +
      ` (expires in ${Math.round((avGoldCache!.expires - now) / 60_000)}m)`,
    );
  } else if (cacheHasData && avBackoff) {
    console.log(
      `[GoldSpot][av-history] using stale data source=${avGoldCache!.source}` +
      ` — AV backoff active for ${Math.round((avGoldBackoffUntil - now) / 60_000)}m`,
    );
  } else if (cacheHasData) {
    console.log(
      `[GoldSpot][av-history] cache expired source=${avGoldCache!.source}` +
      ` (${Math.round((now - avGoldCache!.expires) / 60_000)}m ago) — will attempt AV refresh`,
    );
  } else if (avBackoff) {
    console.log(
      `[GoldSpot][av-history] no data + AV backoff active for ${Math.round((avGoldBackoffUntil - now) / 60_000)}m` +
      ` — Gold history unavailable: AV rate-limited and no persistent cache exists`,
    );
  } else if (needAvFetch) {
    console.log(`[GoldSpot][av-history] cache MISS — fetching Alpha Vantage`);
  } else {
    console.log(`[GoldSpot][av-history] skipped — ALPHA_VANTAGE_API_KEY not set`);
  }

  // Start four fetches in parallel:
  //  1. gold-api.com        : live XAU/USD spot — displayed price only, never used in % calc
  //  2. Stooq XAUUSD        : spot price fallback (if gold-api.com fails)
  //  3. Alpha Vantage       : daily XAU/USD closes for Today%/5D% (conditional on cache)
  //  4. Yahoo GC=F 30m/5d   : futures intraday — ALWAYS the chart source (pure futures, no spot)
  const [goldApiRes, stooqLatestRes, avRes, gcIntradayRes] = await Promise.allSettled([
    timedFetch("https://api.gold-api.com/price/XAU"),
    timedFetch("https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv"),
    needAvFetch
      ? timedFetch(`https://www.alphavantage.co/query?function=GOLD_SILVER_HISTORY&symbol=GOLD&interval=daily&apikey=${avKey}`)
      : Promise.resolve(null as unknown as Response),
    timedFetch("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=30m&range=5d"),
  ]);

  // ── Live price: gold-api.com ──────────────────────────────────────────────
  let livePrice: number | null = null;
  let liveSource = "none";
  let goldApiUpdatedAt: string | null = null;

  if (goldApiRes.status === "fulfilled" && goldApiRes.value.ok) {
    const json = (await goldApiRes.value.json()) as { price?: unknown; updatedAt?: string };
    if (typeof json.price === "number") {
      livePrice = json.price;
      liveSource = "goldapi.com";
      goldApiUpdatedAt = json.updatedAt ?? null;
      console.log(`[DIAG][GoldSpot][goldapi] price=${livePrice} updatedAt=${goldApiUpdatedAt}`);
    } else {
      console.log(`[DIAG][GoldSpot][goldapi] status=200 but price field missing/invalid`);
    }
  } else {
    const err = goldApiRes.status === "rejected" ? String(goldApiRes.reason) : `HTTP ${(goldApiRes.value as Response).status}`;
    console.log(`[DIAG][GoldSpot][goldapi] FAILED: ${err}`);
  }

  // ── Stooq latest: price fallback ONLY — never used for previousClose ──────
  let stooqClose: number | null = null;
  if (stooqLatestRes.status === "fulfilled" && stooqLatestRes.value.ok) {
    const text = await stooqLatestRes.value.text();
    const cols = text.trim().split("\n")[1]?.split(",") ?? [];
    if (cols[1] !== "N/D" && cols.length >= 7) {
      const c = parseFloat(cols[6]);
      if (!isNaN(c)) stooqClose = c;
      console.log(`[DIAG][GoldSpot][stooq-latest] close=${stooqClose} date=${cols[1]}`);
    }
  }

  if (livePrice === null && stooqClose !== null) {
    livePrice = stooqClose;
    liveSource = "stooq-close-fallback";
    console.log(`[DIAG][GoldSpot] gold-api.com unavailable — using Stooq close as fallback`);
  }
  if (livePrice === null) throw new Error("GoldSpot: all price sources failed");

  // ── Alpha Vantage: daily history → previousClose + 5-day sparkline ───────
  if (needAvFetch) {
    if (avRes.status === "fulfilled" && avRes.value !== null && (avRes.value as Response).ok) {
      const json = (await (avRes.value as Response).json()) as {
        data?: { date: string; price: string }[];
        Information?: string;
        Note?: string;
      };
      if (json.Information || json.Note) {
        console.log(`[GoldSpot][av-history] quota/rate-limit hit — ${(json.Information ?? json.Note ?? "").slice(0, 120)}`);
        // Set a 6-hour backoff so we don't hammer the endpoint on every 60-second refresh.
        // IMPORTANT: avGoldCache.data is intentionally NOT cleared — any existing rows
        // (from a previous successful fetch or persistent file) remain usable as stale history.
        avGoldBackoffUntil = now + 6 * 60 * 60 * 1000;
        console.log(
          `[GoldSpot][av-history] backoff set 6h until ${new Date(avGoldBackoffUntil).toISOString()}` +
          ` — existing rows preserved: ${cacheHasData ? avGoldCache!.data.length : 0}`,
        );
      } else if (Array.isArray(json.data) && json.data.length > 0) {
        avGoldCache = { data: json.data, expires: now + AV_GOLD_CACHE_TTL_MS, source: "fresh-av" };
        avGoldBackoffUntil = 0; // reset any previous backoff
        savePersistentGoldCache(json.data);
        console.log(`[GoldSpot][av-history] fresh data: ${json.data.length} rows, expires ${new Date(avGoldCache.expires).toISOString()}`);
      } else {
        console.log(`[GoldSpot][av-history] unexpected response shape — no data array`);
      }
    } else {
      const errDetail = avRes.status === "rejected"
        ? String(avRes.reason)
        : avRes.value === null ? "skipped (no key)" : `HTTP ${(avRes.value as Response).status}`;
      console.log(`[GoldSpot][av-history] FAILED: ${errDetail} — will use stale cache if available`);
    }
  } else if (!avKey) {
    console.log(`[GoldSpot][av-history] skipped — ALPHA_VANTAGE_API_KEY not set; previousClose will be null`);
  }
  // else: cache HIT already logged above before the parallel fetch

  // Build previousClose + history (6 pts for 5D calc) from AV if available.
  // chartData is always GC=F futures (declared below, after intraday fetch).
  let previousClose: number | null = null;
  let history: HistoryPoint[] = [];
  let histSource = "none";
  let metricsSeries: HistoryPoint[] | undefined;

  if (avGoldCache && avGoldCache.data.length > 0) {
    const rows = avGoldCache.data;
    const todayStr = new Date().toISOString().slice(0, 10);

    // ── Diagnostic: log first 10 AV rows ──────────────────────────────────────
    console.log(`[GoldSpot][DIAG] avCache rows=${rows.length} order=${rows[0]?.date > rows[1]?.date ? "newest-first(desc)" : "oldest-first(asc)"}`);
    rows.slice(0, 10).forEach((r, i) =>
      console.log(`[GoldSpot][DIAG]  av[${i}] date=${r.date} price=${r.price} parsed=${parseFloat(r.price)}`));

    // AV GOLD_SILVER_HISTORY returns newest-first (desc). rows[0] = most recent close.
    // If AV has already published today's close, rows[0].date === today.
    // In that case use rows[1] as previousClose (yesterday's true previous close),
    // exactly the same pattern as fetchYahoo.
    const pcRow = rows[0]?.date === todayStr ? rows[1] : rows[0];
    const pc = parseFloat(pcRow?.price ?? "NaN");
    if (!isNaN(pc)) {
      previousClose = pc;
      histSource = `av-daily (close ${pcRow?.date})`;
    }
    console.log(`[GoldSpot][DIAG] todayStr=${todayStr} rows[0].date=${rows[0]?.date} pcRow=${pcRow?.date}=${pcRow?.price} previousClose=${previousClose}`);

    // 6 points (oldest → newest) for 5D calculation
    // Always take rows[0..5] (all newest-first) and reverse to chronological order.
    const histPts: HistoryPoint[] = rows
      .slice(0, 6)
      .map((r) => ({ date: r.date, price: parseFloat(r.price) }))
      .filter((p) => !isNaN(p.price))
      .reverse();
    if (histPts.length > 0) history = histPts;
    metricsSeries = rows
      .map((r) => ({ date: r.date, price: parseFloat(r.price) }))
      .filter((p) => !isNaN(p.price))
      .reverse();
    console.log(`[GoldSpot][DIAG] history (6-pt): length=${history.length} | pts=${history.map(p => p.date+"="+p.price.toFixed(2)).join(", ")}`);

  } else {
    console.log(`[GoldSpot][DIAG] avCache empty or unavailable — will use GC=F chart + Today%/5D% fallback`);
  }

  // ── GC=F intraday 30m: chart series (ALWAYS — pure futures, no spot mixed in) ─
  // chartData is EXCLUSIVELY GC=F closes. The card price (spot) is NEVER appended.
  // Rule: never mix spot and futures in the same chart series.
  let chartData: HistoryPoint[] | undefined;
  let gcFuturesPrice: number | null = null;
  let gcDayLow:  number | null = null;
  let gcDayHigh: number | null = null;

  if (gcIntradayRes.status === "fulfilled" && gcIntradayRes.value.ok) {
    const ij = (await gcIntradayRes.value.json()) as YahooChartJson;
    const ir = ij?.chart?.result?.[0];
    if (ir) {
      gcFuturesPrice =
        typeof ir.meta?.regularMarketPrice === "number" ? ir.meta.regularMarketPrice : null;
      gcDayLow  = typeof ir.meta?.regularMarketDayLow  === "number" ? ir.meta.regularMarketDayLow  : null;
      gcDayHigh = typeof ir.meta?.regularMarketDayHigh === "number" ? ir.meta.regularMarketDayHigh : null;
      const its = ir.timestamp ?? [];
      const ic  = ir.indicators?.quote?.[0]?.close ?? [];
      const rawPts: HistoryPoint[] = [];
      for (let i = 0; i < its.length; i++) {
        const v = ic[i];
        if (typeof v === "number")
          rawPts.push({ date: new Date(its[i] * 1000).toISOString().slice(0, 16), price: v });
      }
      if (rawPts.length >= 2) {
        chartData = lttb(rawPts, 75);
        console.log(
          `[GoldSpot][chart] GC=F 30m: ${rawPts.length} raw → LTTB → ${chartData.length} pts` +
          ` | chartSource=Yahoo GC=F futures (pure) | gcFuturesPrice=${gcFuturesPrice}` +
          ` | dayLow=${gcDayLow} dayHigh=${gcDayHigh}`,
        );
      }
    }
  } else {
    const gcErr =
      gcIntradayRes.status === "rejected"
        ? String(gcIntradayRes.reason)
        : `HTTP ${gcIntradayRes.value?.status}`;
    console.log(`[GoldSpot][chart] GC=F intraday FAILED: ${gcErr}`);
  }

  // ── GC=F daily fallback: Today%/5D% when AV unavailable ──────────────────
  // Rule: never calculate spot latest vs futures historical close.
  // When GC=F closes are used as the history baseline, also use GC=F latest price
  // (not spot) as the endpoint for % calculations. The card still DISPLAYS the
  // live spot price via displayPrice — only the denominator changes.
  if (previousClose === null && history.length === 0) {
    const todayStr2 = new Date().toISOString().slice(0, 10);
    console.log(`[GoldSpot][fallback] AV unavailable — fetching GC=F daily for Today%/5D%`);
    try {
      const gcDailyRes = await timedFetch(
        // Strict 1Y stats require >=253 observations (252 sessions back + endpoint).
        // `range=1y` can return 252 bars, so use 2y to be safe.
        "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=2y",
      );
      if (gcDailyRes.ok) {
        const gj = (await gcDailyRes.json()) as YahooChartJson;
        const gr = gj?.chart?.result?.[0];
        if (gr) {
          // Capture GC=F latest if intraday didn't provide it
          if (gcFuturesPrice === null && typeof gr.meta?.regularMarketPrice === "number") {
            gcFuturesPrice = gr.meta.regularMarketPrice;
          }
          const gts = gr.timestamp ?? [];
          const gc  = gr.indicators?.quote?.[0]?.close ?? [];
          const allPts: HistoryPoint[] = [];
          for (let i = 0; i < gts.length; i++) {
            const v = gc[i];
            if (typeof v === "number")
              allPts.push({ date: new Date(gts[i] * 1000).toISOString().slice(0, 10), price: v });
          }
          if (allPts.length >= 2) {
            const lastBarDate = allPts[allPts.length - 1].date;
            const isToday = lastBarDate === todayStr2;
            previousClose = isToday ? allPts[allPts.length - 2].price : allPts[allPts.length - 1].price;
            history = takeLast(allPts, 6);
            metricsSeries = allPts;
            histSource = "yahoo-gold-futures-fallback (GC=F daily)";
            console.log(
              `[GoldSpot][fallback] GC=F daily OK: ${allPts.length} pts` +
              ` | previousClose=${previousClose?.toFixed(2)} (${isToday ? "2nd-to-last" : "last"})` +
              ` | history=${history.length} pts` +
              ` | 5Dbaseline=${history[0]?.price?.toFixed(2)} (${history[0]?.date})` +
              ` | gcFuturesPrice=${gcFuturesPrice}` +
              ` | moveSource=Yahoo GC=F futures proxy`,
            );
          } else {
            console.log(`[GoldSpot][fallback] GC=F daily: too few pts (${allPts.length})`);
          }
        }
      } else {
        console.log(`[GoldSpot][fallback] GC=F daily FAILED: HTTP ${gcDailyRes.status}`);
      }
    } catch (e) {
      console.log(`[GoldSpot][fallback] GC=F daily fetch error: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Finalise prices ────────────────────────────────────────────────────────
  // When using GC=F as the history source:
  //   calcPrice   = GC=F latest (so Today% = GC=F/GC=F, 5D% = GC=F/GC=F)
  //   displayPrice = live spot  (shown on the card)
  // When using AV spot closes:
  //   calcPrice   = livePrice (spot vs spot, fine to mix same asset class)
  //   displayPrice = undefined (price === calcPrice, no override needed)
  const usesFuturesFallback = histSource.includes("futures") && gcFuturesPrice !== null;
  const calcPrice: number    = usesFuturesFallback ? gcFuturesPrice! : livePrice;
  const displayPrice: number | undefined = usesFuturesFallback ? livePrice : undefined;

  // ── Proof log ──────────────────────────────────────────────────────────────
  const firstHist = history.length > 0 ? history[0].price : null;
  const todayPct  = previousClose !== null && previousClose !== 0
    ? ((calcPrice - previousClose) / previousClose) * 100 : null;
  const fiveDpct  = firstHist !== null && firstHist !== 0
    ? ((calcPrice - firstHist) / firstHist) * 100 : null;
  console.log(
    `[LIVE] Gold Spot` +
    ` | priceSource=${liveSource} displayedPrice=${(displayPrice ?? calcPrice).toFixed(2)}` +
    ` | calcPrice=${calcPrice.toFixed(2)} (${usesFuturesFallback ? "GC=F futures" : "spot"})` +
    ` | moveSource=${histSource} | chartSource=Yahoo GC=F futures (pure)` +
    ` | previousClose=${previousClose?.toFixed(2) ?? "null"}` +
    ` | histLen=${history.length} | 5Dbaseline=${firstHist?.toFixed(2) ?? "null"} (${history[0]?.date ?? "n/a"})` +
    ` | chartPts=${chartData?.length ?? 0} (no spot mixed)` +
    ` | todayPct=${todayPct !== null ? todayPct.toFixed(3)+"%" : "null (Live spot)"}` +
    ` | 5Dpct=${fiveDpct !== null ? fiveDpct.toFixed(3)+"%" : "null (—)"}` +
    ` | goldApiUpdatedAt=${goldApiUpdatedAt} | ${new Date().toISOString()}`,
  );

  return {
    price: calcPrice,
    displayPrice,
    previousClose,
    history,
    metricsSeries,
    metricsCadence: "daily",
    chartData,
    low: gcDayLow,
    high: gcDayHigh,
  };
}

// Stooq: free, no API key, no rate limits, no auth.
// Latest:  https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcv&h&e=csv
// History: https://stooq.com/q/d/l/?s={symbol}&d1=YYYYMMDD&d2=YYYYMMDD&i=d
async function fetchStooq(stooqSymbol: string): Promise<RawData> {
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const today = new Date();
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  const latestUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const histUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${fmtDate(tenDaysAgo)}&d2=${fmtDate(today)}&i=d`;

  console.log(`[DIAG][Stooq][${stooqSymbol}] GET latest + history at ${new Date().toISOString()}`);
  const [latestRes, histRes] = await Promise.all([timedFetch(latestUrl), timedFetch(histUrl)]);
  console.log(`[DIAG][Stooq][${stooqSymbol}] latest=${latestRes.status} history=${histRes.status}`);

  if (!latestRes.ok) throw new Error(`Stooq HTTP ${latestRes.status}`);
  const latestText = await latestRes.text();

  // CSV row: Symbol,Date,Time,Open,High,Low,Close,Volume
  const rows = latestText.trim().split("\n");
  if (rows.length < 2) throw new Error("Stooq: empty response");
  const cols = rows[1].split(",");
  if (cols[1] === "N/D") throw new Error("Stooq: N/D — symbol unsupported by this source");
  const price = parseFloat(cols[6]);
  if (isNaN(price)) throw new Error("Stooq: no close price");

  // History CSV: Date,Open,High,Low,Close,Volume
  let history: HistoryPoint[] = [];
  let metricsSeries: HistoryPoint[] | undefined;
  let previousClose: number | null = null;
  if (histRes.ok) {
    const histText = await histRes.text();
    const histRows = histText.trim().split("\n").slice(1); // skip header
    const points: HistoryPoint[] = [];
    for (const row of histRows) {
      const c = row.split(",");
      if (c.length < 5) continue;
      const close = parseFloat(c[4]);
      if (!isNaN(close) && c[0]) points.push({ date: c[0], price: close });
    }
    metricsSeries = points.length > 0 ? points : undefined;
    history = takeLast(points, 6);
    if (points.length >= 2) previousClose = points[points.length - 2].price;
  }

  console.log(`[DIAG][Stooq][${stooqSymbol}] parsed OK — price=${price} historyPoints=${history.length} lastDate=${history.at(-1)?.date ?? "none"}`);
  return { price, previousClose, history, metricsSeries };
}

async function fetchFredObservations(seriesId: string, observationLimit: number): Promise<RawData> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${observationLimit}`;
  console.log(`[DIAG][FRED][${seriesId}] GET ...observations?series_id=${seriesId}&limit=${observationLimit} at ${new Date().toISOString()}`);
  const res = await timedFetch(url);
  console.log(`[DIAG][FRED][${seriesId}] status=${res.status}`);
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.log(`[DIAG][FRED][${seriesId}] error body: ${errBody.slice(0, 300)}`);
    throw new Error(`FRED HTTP ${res.status}`);
  }
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  const obs = json?.observations ?? [];
  const parsed = obs
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => !Number.isNaN(o.value));
  if (!parsed.length) throw new Error("No FRED data");
  // FRED returns desc (newest-first) → reverse to chronological asc for sparkline/history
  const asc = parsed.slice().reverse();
  const allPts: HistoryPoint[] = asc.map((o) => ({ date: o.date, price: o.value }));
  const history  = takeLast(allPts, 6);                             // 6 pts for 5D/1W calc only
  const chartData = allPts.length > 6 ? takeLast(allPts, 10) : undefined;
  const prevClose = parsed[1]?.value ?? null; // parsed[0]=latest, parsed[1]=prev (desc order)
  console.log(
    `[DIAG][FRED][${seriesId}] parsed OK` +
      ` | price=${parsed[0].value} prevClose=${prevClose}` +
      ` | todayBps=${prevClose !== null ? ((parsed[0].value - prevClose) * 100).toFixed(1) : "n/a"}` +
      ` | histLen=${history.length} 5Dbaseline=${history[0]?.price} (${history[0]?.date ?? "n/a"})` +
      ` | 5Dbps=${history.length >= 2 ? ((parsed[0].value - history[0].price) * 100).toFixed(1) : "n/a"}` +
      ` | chartLen=${chartData?.length ?? history.length}` +
      ` | chartFirst=${chartData?.[0]?.date ?? history[0]?.date ?? "n/a"}` +
      ` | chartLast=${chartData?.at(-1)?.date ?? history.at(-1)?.date ?? "n/a"}`,
  );
  return {
    price: parsed[0].value,
    previousClose: prevClose,
    history,
    metricsSeries: allPts,
    metricsCadence: "daily",
    chartData,
    sourceLabel: "FRED EOD",
    observationDate: parsed[0].date,
    dataKind: "EOD",
  };
}

async function fetchFred(seriesId: string): Promise<RawData> {
  // Strict 1Y requires >=253 observations; use ~300 to cover business-day gaps/holidays.
  // chartData remains recent (~10).
  return fetchFredObservations(seriesId, 300);
}

/** SWEA may return an array directly or wrap rows; field names vary by serializer. */
function normalizeRiksbankObservationRows(payload: unknown): Array<{ date: string; value: number | string }> {
  const tryCoerceRow = (o: unknown): { date: string; value: number | string } | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const date = r.date ?? r.Datum ?? r.dtm ?? r.Date ?? r.CalendarDay ?? r.businessDate;
    const rawVal =
      r.value ?? r.Value ?? r.rate ?? r.Rate ?? r.observation ?? r.observationValue ?? r.observation_value;
    const value =
      typeof rawVal === "object" &&
      rawVal &&
      typeof (rawVal as Record<string, unknown>).value !== "undefined"
        ? ((rawVal as Record<string, unknown>).value as number | string)
        : (rawVal as number | string | undefined);
    if (typeof date !== "string" || date.length < 8) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    return { date, value };
  };

  if (Array.isArray(payload)) {
    return payload.map(tryCoerceRow).filter((x): x is NonNullable<typeof x> => x !== null);
  }
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const inner =
      p.observations ??
      p.Observations ??
      p.observation ??
      p.data ??
      p.Data ??
      p.values ??
      p.Values ??
      p.items ??
      p.Items;
    if (Array.isArray(inner)) {
      return inner.map(tryCoerceRow).filter((x): x is NonNullable<typeof x> => x !== null);
    }
  }
  return [];
}

const RIKSBANK_CACHE_PREFIX = "data/cache/riksbank";
/** When live SWEA calls fail (quota, network), replay last-good rows from disk — same seriesId, unchanged calculations. Workers skip silently. */
const RIKSBANK_DISK_MAX_STALE_MS = 14 * 24 * 60 * 60 * 1000;

function saveRiksbankPersistent(seriesId: string, data: RawData): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path") as typeof import("path");
    const dir = `${RIKSBANK_CACHE_PREFIX}`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fp = join(RIKSBANK_CACHE_PREFIX, `${seriesId}.json`);
    writeFileSync(fp, JSON.stringify({ savedAt: new Date().toISOString(), payload: data }, null, 2), "utf8");
  } catch {
    /* expected on Workers / read-only filesystem */
  }
}

type RiksbankDiskInspect = {
  path: string;
  usable: RawData | null;
  snapshot: Readonly<{
    fileExists: boolean;
    savedAt: string | undefined;
    ageMs: number | undefined;
    staleForUse: boolean;
    invalidPayload: boolean;
    parseError: boolean;
    historyLen: number;
    latestDate: string | undefined;
    latestValue: number | undefined;
  }>;
};

/** Read disk cache once; distinguishes absent / stale / invalid vs loadable snapshot (for logs + replay). Workers / missing fs → treat as absent. */
function inspectRiksbankDisk(seriesId: string): RiksbankDiskInspect {
  const fpSynthetic = `${RIKSBANK_CACHE_PREFIX}/${seriesId}.json`;
  const emptySnap = (): RiksbankDiskInspect["snapshot"] => ({
    fileExists: false,
    savedAt: undefined,
    ageMs: undefined,
    staleForUse: false,
    invalidPayload: false,
    parseError: false,
    historyLen: 0,
    latestDate: undefined,
    latestValue: undefined,
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path") as typeof import("path");
    const fp = join(RIKSBANK_CACHE_PREFIX, `${seriesId}.json`);

    if (!existsSync(fp)) {
      return { path: fp, usable: null, snapshot: emptySnap() };
    }

    let parsed: { savedAt?: string; payload?: RawData };
    try {
      parsed = JSON.parse(readFileSync(fp, "utf8")) as { savedAt?: string; payload?: RawData };
    } catch {
      return {
        path: fp,
        usable: null,
        snapshot: {
          ...emptySnap(),
          fileExists: true,
          parseError: true,
        },
      };
    }

    const savedAt = parsed.savedAt;
    const savedAtMs = savedAt ? Date.parse(savedAt) : 0;
    const ageMs = savedAtMs ? Date.now() - savedAtMs : undefined;
    const staleForUse = !savedAtMs || Date.now() - savedAtMs > RIKSBANK_DISK_MAX_STALE_MS;
    const p = parsed.payload;
    const badShape = !p?.history?.length || typeof p.price !== "number";

    let historyLen = 0;
    let latestDate: string | undefined;
    let latestValue: number | undefined;
    if (p?.history?.length && typeof p.price === "number") {
      historyLen = p.history.length;
      latestDate = p.history[p.history.length - 1]?.date;
      latestValue = p.price;
    }

    if (badShape) {
      return {
        path: fp,
        usable: null,
        snapshot: {
          fileExists: true,
          savedAt,
          ageMs,
          staleForUse,
          invalidPayload: true,
          parseError: false,
          historyLen,
          latestDate,
          latestValue,
        },
      };
    }

    const raw = p as RawData;
    if (staleForUse) {
      return {
        path: fp,
        usable: null,
        snapshot: {
          fileExists: true,
          savedAt,
          ageMs,
          staleForUse: true,
          invalidPayload: false,
          parseError: false,
          historyLen,
          latestDate,
          latestValue,
        },
      };
    }

    return {
      path: fp,
      usable: raw,
      snapshot: {
        fileExists: true,
        savedAt,
        ageMs,
        staleForUse: false,
        invalidPayload: false,
        parseError: false,
        historyLen,
        latestDate,
        latestValue,
      },
    };
  } catch {
    return { path: fpSynthetic, usable: null, snapshot: emptySnap() };
  }
}

function logRiksbankCacheResolution(seriesId: string, inspected: RiksbankDiskInspect): void {
  const s = inspected.snapshot;
  if (!s.fileExists) {
    console.log(`[Riksbank][${seriesId}] cache miss path=${inspected.path}`);
    console.log(`[Riksbank][${seriesId}] cache stale=n/a`);
    console.log(`[Riksbank][${seriesId}] cache hit=no`);
    return;
  }

  const displayHit = Boolean(inspected.usable);
  console.log(`[Riksbank][${seriesId}] cache stale=${s.staleForUse ? "yes" : "no"} ageMs=${s.ageMs ?? "n/a"} maxStaleMs=${RIKSBANK_DISK_MAX_STALE_MS}`);
  console.log(`[Riksbank][${seriesId}] cache hit=${displayHit ? "yes" : "no"} path=${inspected.path} savedAt=${s.savedAt ?? "unknown"}`);
  if (displayHit) {
    console.log(
      `[Riksbank][${seriesId}] cache payload historyLen=${s.historyLen} latestDate=${s.latestDate ?? "n/a"} latestValue=${s.latestValue ?? "n/a"}`,
    );
  }
  if (s.parseError) {
    console.log(`[Riksbank][${seriesId}] cache detail=parse_error`);
  } else if (s.invalidPayload) {
    console.log(`[Riksbank][${seriesId}] cache detail=invalid_payload`);
  } else if (s.staleForUse && !displayHit) {
    console.log(`[Riksbank][${seriesId}] cache detail=stale_discarded`);
  }
}

function rawDataFromRiksbankNormalized(
  seriesId: string,
  normalized: Array<{ date: string; value: number | string }>,
): RawData {
  const allPts: HistoryPoint[] = normalized
    .map((o) => ({
      date: o.date,
      price: typeof o.value === "number" ? o.value : parseFloat(o.value as string),
    }))
    .filter((p) => !Number.isNaN(p.price))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!allPts.length) throw new Error("No Riksbank data");
  const history   = takeLast(allPts, 6);
  const chartData = allPts.length > 6 ? takeLast(allPts, 10) : undefined;
  const latestPrice = allPts[allPts.length - 1].price;
  const prevClose   = allPts[allPts.length - 2]?.price ?? null;
  console.log(
    `[Riksbank][${seriesId}] parsed OK` +
      ` normalizedRows=${normalized.length}` +
      ` pricePoints=${allPts.length}` +
      ` latestDate=${allPts.at(-1)?.date}` +
      ` price=${latestPrice} prevClose=${prevClose}` +
      ` todayBps=${prevClose !== null ? ((latestPrice - prevClose) * 100).toFixed(1) : "n/a"}` +
      ` histLen=${history.length} 5Dbaseline=${history[0]?.price} (${history[0]?.date ?? "n/a"})` +
      ` 5Dbps=${history.length >= 2 ? ((latestPrice - history[0].price) * 100).toFixed(1) : "n/a"}` +
      ` chartLen=${chartData?.length ?? history.length}` +
      ` chartFirst=${chartData?.[0]?.date ?? history[0]?.date ?? "n/a"}` +
      ` chartLast=${chartData?.at(-1)?.date ?? history.at(-1)?.date ?? "n/a"}`,
  );
  return {
    price: latestPrice,
    previousClose: prevClose,
    history,
    metricsSeries: allPts,
    metricsCadence: "daily",
    chartData,
    sourceLabel: "Riksbank",
    observationDate: allPts.at(-1)?.date,
    dataKind: "EOD",
  };
}

type RiksbankLiveOutcome = { ok: true; raw: RawData } | { ok: false; reason: string; http?: number };

/** Pure live SWEA call + parse — no disk replay, no persistent save (caller handles). */
async function fetchRiksbankLiveOnly(seriesId: string): Promise<RiksbankLiveOutcome> {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  // Strict 1Y needs ~252 business-day observations; fetch ~400 calendar days.
  startDate.setDate(startDate.getDate() - 400);
  const start = startDate.toISOString().slice(0, 10);
  const riksUrl = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start}/${today}`;
  const riksHeaders = { Accept: "application/json", "User-Agent": UA } as const;

  let histRes: Response;
  let liveAttempt = 1;
  try {
    histRes = await timedFetch(riksUrl, { headers: { ...riksHeaders } });
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    console.log(`[Riksbank][${seriesId}] live fetch status attempt=${liveAttempt} http=network_error ok=false err=${msg}`);
    return { ok: false, reason: `network: ${msg}` };
  }

  console.log(
    `[Riksbank][${seriesId}] live fetch status attempt=${liveAttempt} http=${histRes.status} ok=${histRes.ok} url=${riksUrl}`,
  );

  if (!histRes.ok && (histRes.status === 403 || histRes.status === 429 || histRes.status >= 500)) {
    await new Promise((r) => setTimeout(r, 500));
    liveAttempt = 2;
    try {
      histRes = await timedFetch(riksUrl, { headers: { ...riksHeaders } });
      console.log(
        `[Riksbank][${seriesId}] live fetch status attempt=${liveAttempt} http=${histRes.status} ok=${histRes.ok} url=${riksUrl}`,
      );
    } catch (e2) {
      console.log(
        `[Riksbank][${seriesId}] live fetch status attempt=${liveAttempt} http=network_error ok=false err=${e2 instanceof Error ? e2.message : e2}`,
      );
      return { ok: false, reason: "retry-fetch-failed" };
    }
  }

  if (!histRes.ok) {
    const errBody = await histRes.text().catch(() => "");
    console.log(`[Riksbank][${seriesId}] live fetch errorBody: ${errBody.slice(0, 500)}`);
    return { ok: false, reason: `Riksbank HTTP ${histRes.status}`, http: histRes.status };
  }

  let jsonUnknown: unknown;
  try {
    jsonUnknown = await histRes.json();
  } catch {
    console.log(`[Riksbank][${seriesId}] response was not JSON`);
    return { ok: false, reason: "invalid JSON response" };
  }

  const payloadShape =
    jsonUnknown === null ? "null" : Array.isArray(jsonUnknown) ? `array[len=${jsonUnknown.length}]` : "object";
  console.log(`[Riksbank][${seriesId}] JSON shape=${payloadShape}`);

  const arr = normalizeRiksbankObservationRows(jsonUnknown);
  console.log(`[Riksbank][${seriesId}] normalize → ${arr.length} rows`);

  if (arr.length === 0) {
    const preview =
      jsonUnknown && typeof jsonUnknown === "object"
        ? JSON.stringify(jsonUnknown).slice(0, 400)
        : String(jsonUnknown).slice(0, 400);
    console.log(`[Riksbank][${seriesId}] empty after normalize — preview: ${preview}`);
    return { ok: false, reason: "empty normalization" };
  }

  try {
    const raw = rawDataFromRiksbankNormalized(seriesId, arr);
    return { ok: true, raw };
  } catch {
    return { ok: false, reason: "filtered to zero valid floats" };
  }
}

function sweden10YDiskCacheAggStatus(inspected: RiksbankDiskInspect): "hit" | "miss" | "stale" {
  const sn = inspected.snapshot;
  if (!sn.fileExists) return "miss";
  if (inspected.usable) return "hit";
  if (sn.fileExists && sn.staleForUse && !sn.parseError && !sn.invalidPayload) return "stale";
  return "miss";
}

function logSweden10YYieldDiagBlock(finalUsed: string, raw: RawData): void {
  const h = raw.history;
  const baseline = h[0];
  const latestDate = h.at(-1)?.date ?? "n/a";
  const seriesTail = [...(raw.chartData ?? raw.history)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const prevObs = seriesTail.length >= 2 ? seriesTail[seriesTail.length - 2] : null;
  console.log(
    `[SWE10Y] diagnostics latestDate=${latestDate} latestValue=${raw.price}` +
      ` prevCloseValue=${raw.previousClose ?? "null"} prevObservationDate=${prevObs?.date ?? "n/a"} prevObservationValue=${prevObs?.price ?? "n/a"}` +
      ` 1wBaselineValue=${baseline?.price ?? "n/a"} 1wBaselineDate=${baseline?.date ?? "n/a"}` +
      ` historyLen=${h.length}` +
      ` chartDataLen=${raw.chartData?.length ?? h.length}` +
      ` finalSourceUsed=${finalUsed}`,
  );
}

/**
 * Sweden 10Y only: SWEA live → validated disk snapshot → OECD monthly gauge via FRED.
 * Keeps SEGVB10YC calculations identical to daily series when SWEA works.
 */
async function fetchSweden10YieldWithTieredFallbacks(): Promise<RawData> {
  const id = SWEDEN_10Y_RIKSBANK_SERIES_ID;

  const live = await fetchRiksbankLiveOnly(id);
  if (live.ok) {
    saveRiksbankPersistent(id, live.raw);
    console.log(`[SWE10Y] primary source status=live Riksbank OK`);
    console.log(`[SWE10Y] cache status=n/a (live succeeded)`);
    console.log(`[SWE10Y] fallback source status=skipped`);
    console.log(`[SWE10Y] final source used=riksbank-live`);
    logSweden10YYieldDiagBlock("riksbank-live", live.raw);
    console.log(`[Riksbank][${id}] final source=live`);
    return live.raw;
  }

  console.log(
    `[SWE10Y] primary source status=live Riksbank FAILED reason=${live.reason} http=${live.http ?? "n/a"}`,
  );

  const inspected = inspectRiksbankDisk(id);
  logRiksbankCacheResolution(id, inspected);
  const agg = sweden10YDiskCacheAggStatus(inspected);
  console.log(`[SWE10Y] cache status=${agg} (see [Riksbank][${id}] lines above)`);

  if (inspected.usable) {
    console.log(`[SWE10Y] fallback source status=skipped`);
    console.log(`[SWE10Y] final source used=riksbank-cache`);
    logSweden10YYieldDiagBlock("riksbank-cache", inspected.usable);
    return inspected.usable;
  }

  if (!process.env.FRED_API_KEY) {
    console.log(`[SWE10Y] fallback source=FRED series ${SWEDEN_10Y_FRED_MONTHLY_SERIES}`);
    console.log(`[SWE10Y] fallback source status=unavailable reason=FRED_API_KEY_missing`);
    console.log(`[SWE10Y] final source used=unavailable`);
    const detail =
      live.http === 403
        ? "SWE 10Y unavailable: Riksbank 403 and no valid cache/fallback."
        : `SWE 10Y unavailable: Riksbank failed (${live.reason}) and no valid cache/FRED fallback.`;
    console.log(`[SWE10Y] ${detail}`);
    throw new Error(detail);
  }

  console.log(
    `[SWE10Y] fallback source=FRED OECD monthly ${SWEDEN_10Y_FRED_MONTHLY_SERIES} (Main Economic Indicators)`,
  );
  try {
    const raw = await fetchFredObservations(SWEDEN_10Y_FRED_MONTHLY_SERIES, 160);
    console.log(`[SWE10Y] fallback source status=OK`);
    console.log(`[SWE10Y] final source used=fred-oecd-monthly`);
    logSweden10YYieldDiagBlock("fred-oecd-monthly", raw);
    // Prevent session-based 1Y from being computed on a monthly series.
    return { ...raw, metricsCadence: "monthly", sourceLabel: "FRED OECD monthly", dataKind: "EOD" };
  } catch (fe) {
    const em = fe instanceof Error ? fe.message : String(fe);
    console.log(`[SWE10Y] fallback source status=FAILED reason=${em}`);
    console.log(`[SWE10Y] final source used=unavailable`);
    const detail =
      live.http === 403
        ? "SWE 10Y unavailable: Riksbank 403 and no valid cache/fallback."
        : `SWE 10Y unavailable: Riksbank failed (${live.reason}) and no valid cache/fallback (${em}).`;
    console.log(`[SWE10Y] ${detail}`);
    throw new Error(detail);
  }
}

async function fetchRiksbank(seriesId: string): Promise<RawData> {
  const tryDisk = (liveFailureReason: string): RawData => {
    const inspected = inspectRiksbankDisk(seriesId);
    logRiksbankCacheResolution(seriesId, inspected);
    if (inspected.usable) {
      console.log(`[Riksbank][${seriesId}] final source=cache liveFailure=${liveFailureReason}`);
      return inspected.usable;
    }
    console.log(`[Riksbank][${seriesId}] final source=unavailable liveFailure=${liveFailureReason}`);
    throw new Error(liveFailureReason);
  };

  const live = await fetchRiksbankLiveOnly(seriesId);
  if (live.ok) {
    saveRiksbankPersistent(seriesId, live.raw);
    console.log(`[Riksbank][${seriesId}] final source=live`);
    return live.raw;
  }

  console.log(`[Riksbank][${seriesId}] primary live failed reason=${live.reason}`);

  try {
    return tryDisk(live.reason);
  } catch {
    if (live.reason === "invalid JSON response") throw new Error("Riksbank: invalid JSON");
    if (live.http !== undefined) throw new Error(`Riksbank HTTP ${live.http}`);
    if (live.reason === "empty normalization") throw new Error("No Riksbank data");
    if (live.reason === "filtered to zero valid floats") throw new Error("No Riksbank data");
    throw new Error(live.reason);
  }
}

const DI_CACHE_PREFIX = "data/cache/di";
const DI_DISK_MAX_STALE_MS = 30 * 60 * 1000;
const DI_MARKETS_LOOKBACK_DAYS = 400;

function saveDiPersistent(insref: string, data: RawData): void {
  try {
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    if (!existsSync(DI_CACHE_PREFIX)) mkdirSync(DI_CACHE_PREFIX, { recursive: true });
    writeFileSync(
      join(DI_CACHE_PREFIX, `${insref}.json`),
      JSON.stringify({ savedAt: new Date().toISOString(), payload: data }),
      "utf8",
    );
  } catch {
    // read-only fs / Workers
  }
}

function loadDiDisk(insref: string): RawData | null {
  try {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    const fp = join(DI_CACHE_PREFIX, `${insref}.json`);
    if (!existsSync(fp)) return null;
    const env = JSON.parse(readFileSync(fp, "utf8")) as { savedAt?: string; payload?: RawData };
    if (!env.payload?.metricsSeries?.length) return null;
    const savedAtMs = env.savedAt ? Date.parse(env.savedAt) : NaN;
    if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > DI_DISK_MAX_STALE_MS) return null;
    return env.payload;
  } catch {
    return null;
  }
}

function rawDataFromDiDaily(insref: string, daily: ReadonlyArray<{ date: string; value: number }>): RawData {
  const allPts: HistoryPoint[] = daily
    .filter((r) => Number.isFinite(r.value))
    .map((r) => ({ date: r.date, price: r.value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!allPts.length) throw new Error("No DI data");
  const history = takeLast(allPts, 6);
  const chartData = allPts.length > 6 ? takeLast(allPts, 10) : undefined;
  const latestPrice = allPts[allPts.length - 1]!.price;
  const prevClose = allPts[allPts.length - 2]?.price ?? null;
  console.log(
    `[DI][${insref}] parsed OK rows=${allPts.length} latest=${latestPrice} prev=${prevClose} ` +
      `todayBps=${prevClose !== null ? ((latestPrice - prevClose) * 100).toFixed(1) : "n/a"}`,
  );
  return {
    price: latestPrice,
    previousClose: prevClose,
    history,
    metricsSeries: allPts,
    metricsCadence: "daily",
    chartData,
    sourceLabel: "Millistream/DI",
    observationDate: allPts.at(-1)?.date,
    dataKind: "delayed",
  };
}

const DI_INSREF_TO_RIKSBANK: Record<string, string> = {
  "33383": "SEGVB10YC",
  "33381": "SEGVB2YC",
};

async function fetchDiSwedishRate(insref: string): Promise<RawData> {
  try {
    const hist = await fetchDiInstrumentHistory(insref);
    const daily = trimRowsToLookback(normalizeDiPointsToDailyEod(hist.points), DI_MARKETS_LOOKBACK_DAYS);
    const raw = rawDataFromDiDaily(insref, daily);
    saveDiPersistent(insref, raw);
    console.log(`[DI][${insref}] final source=live`);
    return raw;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[DI][${insref}] live failed: ${msg}`);
    const cached = loadDiDisk(insref);
    if (cached) {
      console.log(`[DI][${insref}] final source=disk-cache`);
      return cached;
    }

    // DI instrument-history can 404 / change without notice. Fall back to Riksbank SWEA
    // so dashboard rates stay available (same series IDs as before the DI switch).
    const riksbankId = DI_INSREF_TO_RIKSBANK[insref];
    if (riksbankId) {
      console.log(`[DI][${insref}] falling back to Riksbank ${riksbankId}`);
      try {
        const raw =
          riksbankId === SWEDEN_10Y_RIKSBANK_SERIES_ID
            ? await fetchSweden10YieldWithTieredFallbacks()
            : await fetchRiksbank(riksbankId);
        console.log(`[DI][${insref}] final source=riksbank-fallback (${riksbankId}) price=${raw.price}`);
        return raw;
      } catch (rbErr) {
        const rbMsg = rbErr instanceof Error ? rbErr.message : String(rbErr);
        console.log(`[DI][${insref}] Riksbank fallback failed: ${rbMsg}`);
        throw new Error(`DI unavailable (${msg}); Riksbank fallback failed (${rbMsg})`);
      }
    }

    throw new Error(`DI rate unavailable (insref ${insref}): ${msg}`);
  }
}

async function fetchFearGreed(): Promise<RawData> {
  // CNN graphdata expects a START date; using today's date returns only 1 point.
  // Use ~400 calendar days to reliably cover >= 252 sessions for strict 1Y stats.
  const today = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  const startStr = start.toISOString().slice(0, 10);
  const cnnUrl = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startStr}`;
  console.log(`[DIAG][CNN][FearGreed] GET ${cnnUrl} at ${new Date().toISOString()}`);
  const res = await timedFetch(cnnUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://edition.cnn.com/",
      Origin: "https://edition.cnn.com",
    },
  });
  console.log(`[DIAG][CNN][FearGreed] status=${res.status}`);
  if (!res.ok) throw new Error(`CNN HTTP ${res.status}`);
  const json = (await res.json()) as {
    fear_and_greed?: { score?: unknown; previous_close?: unknown };
    fear_and_greed_historical?: { data?: Array<{ x: number; y: number }> };
  };
  const price = json?.fear_and_greed?.score;
  const previousClose = json?.fear_and_greed?.previous_close ?? null;
  if (typeof price !== "number") throw new Error("No fear/greed score");
  const histRaw = json?.fear_and_greed_historical?.data ?? [];
  const points = histRaw
    .map((p) => {
      const y = typeof p.y === "number" ? p.y : parseFloat(String(p.y));
      return { x: p.x, y };
    })
    .filter((p) => Number.isFinite(p.y))
    .map((p) => ({ date: new Date(p.x).toISOString().slice(0, 10), price: p.y }));
  const history = takeLast(points, 6);
  console.log(`[DIAG][CNN][FearGreed] parsed OK — score=${price} historyPoints=${history.length} lastDate=${history.at(-1)?.date ?? "none"}`);
  return {
    price,
    previousClose: typeof previousClose === "number" ? previousClose : null,
    history,
    metricsSeries: points,
    metricsCadence: "daily",
  };
}

async function fetchCboe(file: string): Promise<RawData> {
  const cboeUrl = `https://cdn.cboe.com/api/global/us_indices/daily_prices/${file}`;
  console.log(`[DIAG][CBOE][${file}] GET ${cboeUrl} at ${new Date().toISOString()}`);
  const res = await fetch(cboeUrl, {
    headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
  });
  console.log(`[DIAG][CBOE][${file}] status=${res.status}`);
  if (!res.ok) throw new Error(`Cboe HTTP ${res.status}`);
  const rows = (await res.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2 && !Number.isNaN(parseFloat(cells[cells.length - 1])));
  const points: HistoryPoint[] = rows
    .map((cells) => ({
      date: normalizeMarketDate(cells[0]),
      price: parseFloat(cells[cells.length - 1]),
    }))
    .filter((p) => !Number.isNaN(p.price));
  if (!points.length) throw new Error("No Cboe data");
  const history = takeLast(points, 6);                                // 6 pts for 5D calc
  const chartData = points.length > 6 ? takeLast(points, 30) : undefined; // up to 30 pts for sparkline

  // CBOE CSV columns: DATE(0), OPEN(1), HIGH(2), LOW(3), CLOSE(4)
  // Extract today's HIGH and LOW from the most recent data row.
  const latestRow = rows[rows.length - 1];
  const high = latestRow?.length >= 5 && !isNaN(parseFloat(latestRow[2])) ? parseFloat(latestRow[2]) : null;
  const low  = latestRow?.length >= 5 && !isNaN(parseFloat(latestRow[3])) ? parseFloat(latestRow[3]) : null;
  const obsDate = points[points.length - 1].date;

  console.log(`[DIAG][CBOE][${file}] parsed OK — price=${points[points.length - 1].price} historyPoints=${history.length} chartPts=${chartData?.length ?? history.length} lastDate=${obsDate} low=${low} high=${high}`);
  return {
    price: points[points.length - 1].price,
    previousClose: points[points.length - 2]?.price ?? null,
    history,
    metricsSeries: points,
    metricsCadence: "daily",
    chartData,
    low,
    high,
    sourceLabel: "CBOE prior close",
    observationDate: obsDate,
    dataKind: "EOD",
  };
}

async function fetchFrankfurter(from: string, to: string): Promise<RawData> {
  const fxUrl = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  console.log(`[DIAG][Frankfurter][${from}-${to}] GET ${fxUrl} at ${new Date().toISOString()}`);
  // Latest
  const latestRes = await fetch(fxUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  console.log(`[DIAG][Frankfurter][${from}-${to}] status=${latestRes.status}`);
  if (!latestRes.ok) throw new Error(`FX HTTP ${latestRes.status}`);
  const latestJson = (await latestRes.json()) as { rates?: Record<string, unknown>; date?: string };
  const price = latestJson?.rates?.[to];
  if (typeof price !== "number") throw new Error("No FX data");

  // Fetch ~400 calendar days of weekday ECB rates for strict 1Y. Sparkline remains recent.
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const ecbObsDate = typeof latestJson.date === "string" ? latestJson.date : fmt(end);
  let history: HistoryPoint[] = [];
  let chartData: HistoryPoint[] | undefined;
  let metricsSeries: HistoryPoint[] | undefined;
  let previousClose: number | null = null;
  try {
    const histRes = await fetch(
      `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=${from}&to=${to}`,
      { headers: { Accept: "application/json" } },
    );
    if (histRes.ok) {
      const json = (await histRes.json()) as { rates?: Record<string, Record<string, number>> };
      const entries = Object.entries(json?.rates ?? {})
        .map(([d, r]) => ({ date: d, price: r?.[to] }))
        .filter((p) => typeof p.price === "number")
        .sort((a, b) => (a.date < b.date ? -1 : 1)) as HistoryPoint[];
      // Keep 6 points for 5D calculation (h[0] = 5 sessions ago = 5d baseline).
      history = takeLast(entries, 6);
      // entries[-1] is the most recently published ECB rate — same date and value as `price`.
      // The true previous close is the day before that: entries[-2].
      previousClose = entries[entries.length - 2]?.price ?? null;
      // All entries (up to ~40) form the richer sparkline
      chartData = entries.length > 6 ? takeLast(entries, 10) : undefined; // ~10 recent ECB business days
      metricsSeries = entries;
    }
  } catch {
    /* ignore */
  }
  // Ensure today's live rate is the last point in both series if ECB hasn't published yet
  const appendToday = (pts: HistoryPoint[]) => {
    if (pts.length && pts[pts.length - 1].price !== price) {
      pts.push({ date: fmt(end), price });
    }
    return pts;
  };
  if (history.length) { history = takeLast(appendToday(history), 6); }
  if (chartData) { chartData = appendToday(chartData); }
  if (metricsSeries?.length) { metricsSeries = appendToday([...metricsSeries]); }
  console.log(`[DIAG][Frankfurter][${from}-${to}] parsed OK — price=${price} previousClose=${previousClose} historyPoints=${history.length} chartPts=${chartData?.length ?? history.length} lastDate=${history.at(-1)?.date ?? "none"}`);
  return {
    price,
    previousClose,
    history,
    metricsSeries,
    metricsCadence: "daily",
    chartData,
    sourceLabel: "ECB ref",
    observationDate: ecbObsDate,
    dataKind: "reference",
  };
}

async function fetchAlphaVantage(t: TickerDef): Promise<RawData> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY missing");
  let url: string;
  if (t.avFn === "GLOBAL_QUOTE" && t.avSymbol) {
    url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${t.avSymbol}&apikey=${key}`;
  } else if (t.avFn === "CURRENCY_EXCHANGE_RATE" && t.avFrom && t.avTo) {
    url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${t.avFrom}&to_currency=${t.avTo}&apikey=${key}`;
  } else {
    throw new Error("No AV fallback");
  }
  console.log(`[DIAG][AlphaVantage][${t.symbol}] GET ${url.replace(key, "***")} at ${new Date().toISOString()}`);
  const res = await fetch(url);
  console.log(`[DIAG][AlphaVantage][${t.symbol}] status=${res.status}`);
  if (!res.ok) throw new Error(`AV HTTP ${res.status}`);
  const json = (await res.json()) as {
    Information?: string;
    Note?: string;
    "Global Quote"?: Record<string, string>;
    "Realtime Currency Exchange Rate"?: Record<string, string>;
  };
  if (json?.Information || json?.Note) throw new Error("AV rate-limited");
  if (t.avFn === "GLOBAL_QUOTE") {
    const q = json?.["Global Quote"];
    const price = parseFloat(q?.["05. price"] ?? "");
    const previousClose = parseFloat(q?.["08. previous close"] ?? "");
    if (Number.isNaN(price)) throw new Error("AV no price");
    console.log(`[DIAG][AlphaVantage][${t.symbol}] parsed OK — price=${price}`);
    return {
      price,
      previousClose: Number.isNaN(previousClose) ? null : previousClose,
      history: [],
    };
  } else {
    const r = json?.["Realtime Currency Exchange Rate"];
    const price = parseFloat(r?.["5. Exchange Rate"] ?? "");
    if (Number.isNaN(price)) throw new Error("AV no rate");
    console.log(`[DIAG][AlphaVantage][${t.symbol}] parsed OK — rate=${price}`);
    return { price, previousClose: null, history: [] };
  }
}

function derive1mStats(
  data: RawData,
  last: number,
): Pick<Quote, "change1m" | "changePercent1m"> {
  const series = data.metricsSeries ?? data.history;
  if (series.length < EQUITY_1M_TRADING_DAYS + 1) {
    return { change1m: null, changePercent1m: null };
  }
  const baseline = series[series.length - 1 - EQUITY_1M_TRADING_DAYS]?.price;
  if (baseline == null || !Number.isFinite(baseline) || baseline === 0) {
    return { change1m: null, changePercent1m: null };
  }
  const change1m = last - baseline;
  const changePercent1m = (change1m / baseline) * 100;
  return { change1m, changePercent1m };
}

const EQUITY_1Y_TRADING_DAYS = 252;

function derive1yStats(
  data: RawData,
  last: number,
): Pick<Quote, "change1y" | "changePercent1y"> {
  if (data.metricsCadence === "monthly") return { change1y: null, changePercent1y: null };
  const series = data.metricsSeries ?? data.history;
  if (series.length < EQUITY_1Y_TRADING_DAYS + 1) {
    return { change1y: null, changePercent1y: null };
  }
  const baseline = series[series.length - 1 - EQUITY_1Y_TRADING_DAYS]?.price;
  if (baseline == null || !Number.isFinite(baseline) || baseline === 0) {
    return { change1y: null, changePercent1y: null };
  }
  const change1y = last - baseline;
  const changePercent1y = (change1y / baseline) * 100;
  return { change1y, changePercent1y };
}

function deriveStats(
  data: RawData,
): Pick<
  Quote,
  "change5d" | "changePercent5d" | "range5d" | "streak" | "change1m" | "changePercent1m" | "change1y" | "changePercent1y"
> {
  const h = data.history;
  if (!h.length) {
    return {
      change5d: null,
      changePercent5d: null,
      range5d: null,
      streak: null,
      change1m: null,
      changePercent1m: null,
      change1y: null,
      changePercent1y: null,
    };
  }
  const first = h[0].price;
  // Always use the live current price (data.price) as the 5d endpoint, not h[-1].
  // For Yahoo/Frankfurter h[-1] ≈ data.price (same value); for Gold they differ
  // (h[-1] = yesterday's AV close, data.price = live gold-api.com price).
  const last = data.price;
  const change5d = last - first;
  const changePercent5d = first !== 0 ? (change5d / first) * 100 : null;
  // Range uses all history points plus today's price for completeness.
  const prices = [...h.map((p) => p.price), last];
  const range5d = { min: Math.min(...prices), max: Math.max(...prices) };

  // Streak: count consecutive same-direction moves ending at the last point
  let streak = 0;
  if (h.length >= 2) {
    const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
    const dir = sign(h[h.length - 1].price - h[h.length - 2].price);
    if (dir !== 0) {
      streak = dir;
      for (let i = h.length - 2; i >= 1; i--) {
        if (sign(h[i].price - h[i - 1].price) === dir) streak += dir;
        else break;
      }
    }
  }
  return { change5d, changePercent5d, range5d, streak, ...derive1mStats(data, last), ...derive1yStats(data, last) };
}

async function fetchOne(t: TickerDef): Promise<Quote> {
  const base: Quote = {
    symbol: t.symbol,
    label: t.label,
    category: t.category,
    unit: t.unit,
    price: null,
    change: null,
    changePercent: null,
    previousClose: null,
    history: [],
    change5d: null,
    changePercent5d: null,
    change1m: null,
    changePercent1m: null,
    change1y: null,
    changePercent1y: null,
    range5d: null,
    streak: null,
    low: null,
    high: null,
  };

  const cached = cache.get(t.symbol);
  if (cached && cached.expires > Date.now()) {
    console.log(`[DIAG][fetchOne][${t.symbol}] Cache HIT — returning cached quote (expires in ${Math.round((cached.expires - Date.now()) / 1000)}s)`);
    return cached.quote;
  }

  console.log(`[DIAG][fetchOne][${t.symbol}] Cache MISS — fetching via source="${t.source}" at ${new Date().toISOString()}`);

  const buildQuote = (data: RawData): Quote => {
    const { price, previousClose } = data;
    // price = calculation price (may be GC=F latest for Gold fallback)
    const change = previousClose !== null ? price - previousClose : null;
    const changePercent =
      previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null;
    return {
      ...base,
      // Card displays displayPrice (spot) when set; calculation price otherwise.
      price: data.displayPrice ?? price,
      previousClose,
      change,
      changePercent,
      history: data.history,
      chartData: data.chartData,
      low: data.low ?? null,
      high: data.high ?? null,
      sourceLabel: data.sourceLabel,
      observationDate: data.observationDate,
      dataKind: data.dataKind,
      ...deriveStats(data),
    };
  };

  // Fire supplemental Yahoo L/H fetch in parallel with the primary source.
  // This runs concurrently so adds zero extra wall-clock latency when the primary
  // (e.g. FRED for ^GSPC) takes longer than the Yahoo call.
  const yahooLhPromise: Promise<Response | null> | null = t.yahooLhSymbol
    ? timedFetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.yahooLhSymbol)}?interval=1d&range=2d`,
      ).catch(() => null)
    : null;

  let lastErr: string | undefined;
  try {
    let data: RawData;
    if (t.symbol === "^TNX") data = await fetchUs10YYield();
    else if (t.source === "yahoo") data = await fetchYahoo(t.symbol);
    else if (t.source === "fred") data = await fetchFred(t.fredId!);
    else if (t.source === "di") data = await fetchDiSwedishRate(t.diInsref!);
    else if (t.source === "riksbank") {
      data =
        t.riksbankId === SWEDEN_10Y_RIKSBANK_SERIES_ID
          ? await fetchSweden10YieldWithTieredFallbacks()
          : await fetchRiksbank(t.riksbankId!);
    }
    else if (t.source === "cnn") data = await fetchFearGreed();
    else if (t.source === "cboe") data = await fetchCboe(t.cboeFile!);
    else if (t.source === "frankfurter") data = await fetchFrankfurter(t.fxFrom!, t.fxTo!);
    else if (t.source === "stooq") data = await fetchStooq(t.stooqSymbol!);
    else if (t.source === "goldspot") data = await fetchGoldSpot();
    else throw new Error("Unknown source");

    // Merge supplemental L/H — primary fetch is already done, Yahoo call likely resolved too.
    if (yahooLhPromise) {
      try {
        const lhRes = await yahooLhPromise;
        if (lhRes?.ok) {
          const lhJson = (await lhRes.json()) as YahooChartJson;
          const lhMeta = lhJson?.chart?.result?.[0]?.meta;
          const lhLow  = typeof lhMeta?.regularMarketDayLow  === "number" ? lhMeta.regularMarketDayLow  : null;
          const lhHigh = typeof lhMeta?.regularMarketDayHigh === "number" ? lhMeta.regularMarketDayHigh : null;
          if (lhLow !== null || lhHigh !== null) {
            data = { ...data, low: lhLow, high: lhHigh };
            console.log(`[DIAG][fetchOne][${t.symbol}] Yahoo L/H supplement: low=${lhLow} high=${lhHigh}`);
          }
        } else if (lhRes) {
          console.log(`[DIAG][fetchOne][${t.symbol}] Yahoo L/H supplement: HTTP ${lhRes.status} — L/H stays null`);
        }
      } catch (e) {
        console.log(`[DIAG][fetchOne][${t.symbol}] Yahoo L/H supplement failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    const quote = buildQuote(data);
    const histLen = data.history.length;
    const lastHistDate = normalizeMarketDate(data.history.at(-1)?.date ?? "");
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const freshFlag = histLen > 0 && lastHistDate >= fiveDaysAgo ? "fresh" : "stale-history";
    console.log(`[LIVE] ${t.symbol} | source=${t.source} | price=${data.price} | histLen=${histLen} | lastDate=${lastHistDate} | status=working | ${freshFlag} | ${new Date().toISOString()}`);
    cache.set(t.symbol, { quote, expires: Date.now() + CACHE_TTL_MS });
    return quote;
  } catch (e) {
    lastErr = e instanceof Error ? e.message : "Failed";
    console.log(`[DIAG][fetchOne][${t.symbol}] PRIMARY FAILED — error="${lastErr}"`);
  }

  // FRED fallback — available from any primary source (not just Yahoo)
  if (t.fredFallbackId) {
    console.log(`[DIAG][fetchOne][${t.symbol}] Trying FRED fallback (${t.fredFallbackId})`);
    try {
      const data = await fetchFred(t.fredFallbackId);
      const quote = buildQuote(data);
      console.log(`[LIVE] ${t.symbol} | source=fred-fallback(${t.fredFallbackId}) | price=${data.price} | histLen=${data.history.length} | status=working | ${new Date().toISOString()}`);
      cache.set(t.symbol, { quote, expires: Date.now() + CACHE_TTL_MS });
      return quote;
    } catch (e) {
      lastErr = `${lastErr}; FRED-fallback: ${e instanceof Error ? e.message : "failed"}`;
      console.log(`[DIAG][fetchOne][${t.symbol}] FRED FALLBACK FAILED — error="${lastErr}"`);
    }
  }

  // Stooq fallback — used when primary source (e.g. goldapi) fails
  if (t.stooqSymbol && t.source !== "stooq") {
    console.log(`[DIAG][fetchOne][${t.symbol}] Trying Stooq fallback (${t.stooqSymbol})`);
    try {
      const data = await fetchStooq(t.stooqSymbol);
      const quote = buildQuote(data);
      console.log(`[LIVE] ${t.symbol} | source=stooq-fallback(${t.stooqSymbol}) | price=${data.price} | histLen=${data.history.length} | status=working | ${new Date().toISOString()}`);
      cache.set(t.symbol, { quote, expires: Date.now() + CACHE_TTL_MS });
      return quote;
    } catch (e) {
      lastErr = `${lastErr}; Stooq-fallback: ${e instanceof Error ? e.message : "failed"}`;
      console.log(`[DIAG][fetchOne][${t.symbol}] STOOQ FALLBACK FAILED — error="${lastErr}"`);
    }
  }

  // Alpha Vantage fallback — available from any primary source
  if (t.avFn) {
    console.log(`[DIAG][fetchOne][${t.symbol}] Trying AlphaVantage fallback`);
    try {
      const data = await fetchAlphaVantage(t);
      const quote = buildQuote(data);
      console.log(`[LIVE] ${t.symbol} | source=alphavantage | price=${data.price} | histLen=${data.history.length} | status=working | ${new Date().toISOString()}`);
      cache.set(t.symbol, { quote, expires: Date.now() + CACHE_TTL_MS });
      return quote;
    } catch (e) {
      const avErr = e instanceof Error ? e.message : "failed";
      const avStatus = avErr.includes("rate-limited") ? "quota-limited" : avErr.includes("no price") || avErr.includes("no rate") ? "source-unsupported" : "unavailable";
      lastErr = `${lastErr}; AV(${avStatus}): ${avErr}`;
      console.log(`[DIAG][fetchOne][${t.symbol}] AV FALLBACK FAILED — status=${avStatus} error="${avErr}"`);
    }
  }

  // CBOE fallback — e.g. VIX when Yahoo fails
  if (t.cboeFallbackFile) {
    console.log(`[DIAG][fetchOne][${t.symbol}] Trying CBOE fallback (${t.cboeFallbackFile})`);
    try {
      const data = await fetchCboe(t.cboeFallbackFile);
      const quote = buildQuote(data);
      console.log(`[LIVE] ${t.symbol} | source=cboe-fallback(${t.cboeFallbackFile}) | price=${data.price} | histLen=${data.history.length} | status=working | ${new Date().toISOString()}`);
      cache.set(t.symbol, { quote, expires: Date.now() + CACHE_TTL_MS });
      return quote;
    } catch (e) {
      lastErr = `${lastErr}; CBOE-fallback: ${e instanceof Error ? e.message : "failed"}`;
      console.log(`[DIAG][fetchOne][${t.symbol}] CBOE FALLBACK FAILED — error="${lastErr}"`);
    }
  }

  if (cached) {
    console.log(`[LIVE] ${t.symbol} | source=stale-cache | price=${cached.quote.price} | status=stale-cache | error="${lastErr}" | ${new Date().toISOString()}`);
    return {
      ...cached.quote,
      error: lastErr,
      fromStaleCache: true,
      sourceLabel: cached.quote.sourceLabel ?? "Cached snapshot",
    };
  }
  // All sources exhausted — return null price so UI shows ERR, not fake numbers.
  const finalErr = lastErr ?? "All sources failed";
  const finalStatus = finalErr.includes("quota-limited") ? "quota-limited"
    : finalErr.includes("source-unsupported") ? "source-unsupported"
    : finalErr.includes("no valid crumb") || finalErr.startsWith("Yahoo HTTP") ? "yahoo-blocked"
    : "unavailable";
  console.log(`[LIVE] ${t.symbol} | source=none | price=null | status=${finalStatus} | error="${finalErr}" | ${new Date().toISOString()}`);
  return { ...base, error: finalErr };
}

export const getMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.all(TICKERS.map((t) => fetchOne(t)));
  return { quotes: results, fetchedAt: new Date().toISOString() };
});
