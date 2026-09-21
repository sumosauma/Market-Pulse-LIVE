/**
 * One-off market data diagnosis — do not commit as product code.
 * Run: npx tsx scripts/diagnose-markets.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const TIMEOUT = 12_000;

async function timedFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
}

type DiagRow = {
  instrument: string;
  symbol: string;
  primarySource: string;
  fallbacks: string;
  endpoint: string;
  sourceValue: string | null;
  sourceObsDate: string | null;
  dashboardValue: string | null;
  match: string;
  freshness: string;
  rootCause: string;
};

function normalizeTnx(raw: number) {
  return raw > 30 ? raw / 10 : raw;
}

async function probeYahoo(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const r = await timedFetch(url);
  if (!r.ok) return { ok: false as const, status: r.status, err: `HTTP ${r.status}` };
  const j = (await r.json()) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> };
  };
  const res = j.chart?.result?.[0];
  const price = res?.meta?.regularMarketPrice;
  const ts = res?.timestamp ?? [];
  const closes = res?.indicators?.quote?.[0]?.close ?? [];
  let lastDate = "n/a";
  for (let i = ts.length - 1; i >= 0; i--) {
    if (typeof closes[i] === "number") {
      lastDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      break;
    }
  }
  if (typeof price !== "number") return { ok: false as const, status: r.status, err: "no price" };
  const val = symbol === "^TNX" ? normalizeTnx(price) : price;
  return { ok: true as const, value: val, date: lastDate, raw: price };
}

async function probeFred(seriesId: string) {
  const key = process.env.FRED_API_KEY;
  if (!key) return { ok: false as const, err: "FRED_API_KEY missing" };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=5`;
  const r = await timedFetch(url);
  if (!r.ok) return { ok: false as const, err: `HTTP ${r.status}` };
  const j = (await r.json()) as { observations?: { date: string; value: string }[] };
  const obs = (j.observations ?? []).filter((o) => o.value !== "." && !Number.isNaN(parseFloat(o.value)));
  if (!obs.length) return { ok: false as const, err: "no data" };
  return { ok: true as const, value: parseFloat(obs[0].value), date: obs[0].date };
}

async function probeRiksbank(seriesId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start.toISOString().slice(0, 10)}/${today}`;
  const r = await timedFetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!r.ok) return { ok: false as const, err: `HTTP ${r.status}` };
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [];
  const rows = arr
    .map((o: { date?: string; value?: number }) => ({ date: o.date, value: o.value }))
    .filter((o) => o.date && typeof o.value === "number")
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  if (!rows.length) return { ok: false as const, err: "empty" };
  const last = rows[rows.length - 1]!;
  return { ok: true as const, value: last.value!, date: last.date! };
}

async function probeFrankfurter(from: string, to: string) {
  const r = await timedFetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!r.ok) return { ok: false as const, err: `HTTP ${r.status}` };
  const j = (await r.json()) as { date?: string; rates?: Record<string, number> };
  const v = j.rates?.[to];
  if (typeof v !== "number") return { ok: false as const, err: "no rate" };
  return { ok: true as const, value: v, date: j.date ?? "n/a" };
}

async function probeCboe(file: string) {
  const r = await timedFetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${file}`, {
    headers: { "User-Agent": UA },
  });
  if (!r.ok) return { ok: false as const, err: `HTTP ${r.status}` };
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1]?.split(",");
  if (!last) return { ok: false as const, err: "empty csv" };
  const date = last[0];
  const close = parseFloat(last[last.length - 1]);
  if (Number.isNaN(close)) return { ok: false as const, err: "parse fail" };
  return { ok: true as const, value: close, date };
}

function readRiksbankCache(seriesId: string) {
  const fp = join("data/cache/riksbank", `${seriesId}.json`);
  if (!existsSync(fp)) return null;
  try {
    const p = JSON.parse(readFileSync(fp, "utf8")) as { savedAt?: string; payload?: { price?: number; history?: { date: string }[] } };
    return {
      savedAt: p.savedAt,
      price: p.payload?.price,
      latestDate: p.payload?.history?.at(-1)?.date,
    };
  } catch {
    return null;
  }
}

// Import getMarkets by dynamic import of built handler — use direct fetch simulation via importing module
const marketsMod = await import("../src/lib/markets.functions.ts");

// Force fresh server memory cache miss by calling fetch paths — getMarkets uses internal cache
// Call twice: note if second is cache hit
const t0 = Date.now();
const payload1 = await marketsMod.getMarkets();
const t1 = Date.now();
const payload2 = await marketsMod.getMarkets();
const t2 = Date.now();

console.log(`\ngetMarkets run1=${t1 - t0}ms run2=${t2 - t1}ms fetchedAt=${payload1.fetchedAt}\n`);

const targets = [
  { instrument: "DXY / US Dollar Index", label: "US Dollar Index", symbol: "DX-Y.NYB" },
  { instrument: "US 2Y Yield", label: "US 2Y Yield", symbol: "DGS2" },
  { instrument: "US 10Y Yield", label: "US 10Y Yield", symbol: "^TNX" },
  { instrument: "Sweden 2Y Yield", label: "Sweden 2Y Yield", symbol: "SEGVB2YC" },
  { instrument: "Sweden 10Y Yield", label: "Sweden 10Y Yield", symbol: "SEGVB10YC" },
  { instrument: "USD/SEK", label: "USD/SEK", symbol: "SEK=X" },
  { instrument: "EUR/SEK", label: "EUR/SEK", symbol: "EURSEK=X" },
  { instrument: "VIX", label: "VIX Index", symbol: "^VIX" },
];

const rows: DiagRow[] = [];

for (const t of targets) {
  const q = payload1.quotes.find((x) => x.label === t.label || x.symbol === t.symbol);
  const dashVal = q?.price != null ? `${q.price}${q.unit ? (q.unit === "%" ? "%" : "") : ""}` : q?.error ? `ERR: ${q.error.slice(0, 60)}` : "null";
  const dashHistDate = q?.history?.at(-1)?.date ?? q?.chartData?.at(-1)?.date ?? "n/a";

  let sourceValue: string | null = null;
  let sourceObsDate: string | null = null;
  let primarySource = "";
  let fallbacks = "";
  let endpoint = "";
  let freshness = "";
  let rootCause = "";
  let match = "";

  if (t.symbol === "DX-Y.NYB") {
    primarySource = "Yahoo v8/chart";
    fallbacks = "none (stale 60s memory cache on fail)";
    endpoint = `query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB`;
    const y = await probeYahoo("DX-Y.NYB");
    if (y.ok) {
      sourceValue = String(y.value);
      sourceObsDate = y.date;
    } else {
      sourceValue = `FAIL: ${y.err}`;
      rootCause = y.err.includes("429") ? "Yahoo rate-limit/bot block" : y.err;
    }
    freshness = q?.error ? `error/stale-cache? ${q.error.slice(0, 40)}` : "Yahoo intraday/delayed";
  } else if (t.symbol === "^TNX") {
    primarySource = "Yahoo ^TNX";
    fallbacks = "FRED DGS10 (daily EOD)";
    endpoint = "Yahoo ^TNX; fallback fred DGS10";
    const y = await probeYahoo("^TNX");
    const f = await probeFred("DGS10");
    if (y.ok) {
      sourceValue = `${y.value}% (yahoo raw=${y.raw})`;
      sourceObsDate = y.date;
      freshness = "Yahoo intraday yield (scaled if >30)";
    } else if (f.ok) {
      sourceValue = `${f.value}% (FRED DGS10)`;
      sourceObsDate = f.date;
      freshness = "FRED daily EOD fallback";
      rootCause = `Yahoo failed: ${y.err}`;
    } else {
      sourceValue = `FAIL yahoo=${y.err} fred=${f.err}`;
      rootCause = "Both Yahoo and FRED failed";
    }
  } else if (t.symbol === "DGS2") {
    primarySource = "FRED DGS2";
    fallbacks = "none";
    endpoint = "api.stlouisfed.org/fred/series/observations?series_id=DGS2";
    const f = await probeFred("DGS2");
    if (f.ok) {
      sourceValue = `${f.value}%`;
      sourceObsDate = f.date;
      freshness = "FRED daily EOD (1 biz day lag typical)";
    } else {
      sourceValue = `FAIL: ${f.err}`;
      rootCause = f.err;
    }
  } else if (t.symbol === "SEGVB10YC") {
    primarySource = "Riksbank SWEA SEGVB10YC";
    fallbacks = "disk cache 14d → FRED IRLTLT01SEM156N monthly";
    endpoint = "api.riksbank.se/swea/v1/Observations/SEGVB10YC/...";
    const rb = await probeRiksbank("SEGVB10YC");
    const cache = readRiksbankCache("SEGVB10YC");
    if (rb.ok) {
      sourceValue = `${rb.value}%`;
      sourceObsDate = rb.date;
      freshness = "Riksbank live daily";
    } else if (cache?.price != null) {
      sourceValue = `${cache.price}% (disk cache)`;
      sourceObsDate = cache.latestDate ?? cache.savedAt ?? "n/a";
      freshness = "stale disk cache";
      rootCause = `Live Riksbank failed: ${rb.err}; using cache saved ${cache.savedAt}`;
    } else {
      sourceValue = `FAIL live=${rb.err}`;
      rootCause = rb.err;
    }
  } else if (t.symbol === "SEGVB2YC") {
    primarySource = "Riksbank SWEA SEGVB2YC";
    fallbacks = "disk cache 14d only";
    endpoint = "api.riksbank.se/swea/v1/Observations/SEGVB2YC/...";
    const rb = await probeRiksbank("SEGVB2YC");
    const cache = readRiksbankCache("SEGVB2YC");
    if (rb.ok) {
      sourceValue = `${rb.value}%`;
      sourceObsDate = rb.date;
      freshness = "Riksbank live daily";
    } else if (cache?.price != null) {
      sourceValue = `${cache.price}% (disk cache)`;
      sourceObsDate = cache.latestDate ?? cache.savedAt ?? "n/a";
      freshness = "stale disk cache";
      rootCause = `Live failed: ${rb.err}`;
    } else {
      sourceValue = `FAIL live=${rb.err}`;
      rootCause = rb.err;
    }
  } else if (t.symbol === "SEK=X") {
    primarySource = "Frankfurter ECB";
    fallbacks = "none";
    endpoint = "api.frankfurter.app/latest?from=USD&to=SEK";
    const fx = await probeFrankfurter("USD", "SEK");
    if (fx.ok) {
      sourceValue = String(fx.value);
      sourceObsDate = fx.date;
      freshness = "ECB reference rate (daily, not live FX)";
    } else {
      sourceValue = `FAIL: ${fx.err}`;
      rootCause = fx.err;
    }
  } else if (t.symbol === "EURSEK=X") {
    primarySource = "Frankfurter ECB";
    fallbacks = "none";
    endpoint = "api.frankfurter.app/latest?from=EUR&to=SEK";
    const fx = await probeFrankfurter("EUR", "SEK");
    if (fx.ok) {
      sourceValue = String(fx.value);
      sourceObsDate = fx.date;
      freshness = "ECB reference rate (daily)";
    } else {
      sourceValue = `FAIL: ${fx.err}`;
      rootCause = fx.err;
    }
  } else if (t.symbol === "^VIX") {
    primarySource = "CBOE official CSV";
    fallbacks = "none";
    endpoint = "cdn.cboe.com/.../VIX_History.csv";
    const c = await probeCboe("VIX_History.csv");
    if (c.ok) {
      sourceValue = String(c.value);
      sourceObsDate = c.date;
      freshness = "CBOE EOD (previous close)";
    } else {
      sourceValue = `FAIL: ${c.err}`;
      rootCause = c.err;
    }
  }

  // Match check
  if (q?.price != null && sourceValue && !sourceValue.startsWith("FAIL")) {
    const srcNum = parseFloat(sourceValue.replace(/%.*$/, "").split(" ")[0]);
    const diff = Math.abs(srcNum - q.price);
    const tol = q.unit === "%" ? 0.05 : t.label.includes("SEK") ? 0.02 : 0.5;
    match = diff <= tol ? "YES" : `NO (Δ=${diff.toFixed(4)})`;
    if (match.startsWith("NO") && !rootCause) {
      rootCause = `Dashboard ${q.price} vs source ${srcNum}; dash histDate=${dashHistDate}`;
    }
  } else if (q?.error) {
    match = "N/A (dashboard error)";
    if (!rootCause) rootCause = q.error.slice(0, 120);
  } else if (q?.price == null) {
    match = "N/A (null price)";
  }

  if (q?.error && !rootCause.includes("cache")) {
    freshness = `stale-cache or error: ${q.error.slice(0, 50)}`;
  }

  rows.push({
    instrument: t.instrument,
    symbol: t.symbol,
    primarySource,
    fallbacks,
    endpoint,
    sourceValue,
    sourceObsDate,
    dashboardValue: dashVal + (q?.error ? ` [error set]` : "") + ` hist@${dashHistDate}`,
    match,
    freshness,
    rootCause: rootCause || (match === "YES" ? "OK" : "investigate"),
  });
}

console.log("| Instrument | Dashboard | Source | Source date | Match? | Freshness | Root cause |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.instrument} | ${r.dashboardValue} | ${r.sourceValue} | ${r.sourceObsDate} | ${r.match} | ${r.freshness} | ${r.rootCause.slice(0, 80)} |`,
  );
}

console.log("\n--- Detail ---\n");
for (const r of rows) {
  console.log(JSON.stringify(r, null, 2));
}
