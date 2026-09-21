/**
 * Read-only market data audit — probes primary sources and compares to fetchOne output.
 * Run: npx tsx scripts/diagnose-markets-audit.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnvFile() {
  const fp = join(process.cwd(), ".env");
  if (!existsSync(fp)) return;
  for (const line of readFileSync(fp, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvFile();

const AUDIT = [
  { label: "US Dollar Index", symbol: "DX-Y.NYB", primary: "yahoo" },
  { label: "US 10Y Yield", symbol: "^TNX", primary: "yahoo", fred: "DGS10" },
  { label: "US 2Y Yield", symbol: "DGS2", primary: "fred", fred: "DGS2" },
  { label: "Sweden 10Y Yield", symbol: "SEGVB10YC", primary: "riksbank" },
  { label: "Sweden 2Y Yield", symbol: "SEGVB2YC", primary: "riksbank" },
  { label: "USD/SEK", symbol: "SEK=X", primary: "frankfurter", fxFrom: "USD", fxTo: "SEK" },
  { label: "EUR/SEK", symbol: "EURSEK=X", primary: "frankfurter", fxFrom: "EUR", fxTo: "SEK" },
  { label: "VIX Index", symbol: "^VIX", primary: "cboe", cboeFile: "VIX_History.csv" },
] as const;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function probeYahoo(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
  const json = (await res.json()) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const r = json?.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice;
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  let lastDate = "";
  let lastClose: number | null = null;
  for (let i = ts.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (typeof c === "number") {
      lastDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      lastClose = c;
      break;
    }
  }
  let displayPrice = typeof price === "number" ? price : null;
  if (symbol === "^TNX" && displayPrice !== null && displayPrice > 30) displayPrice /= 10;
  return { ok: true as const, price: displayPrice, lastBarDate: lastDate, lastBarClose: lastClose, rawPrice: price };
}

async function probeFred(seriesId: string) {
  const key = process.env.FRED_API_KEY;
  if (!key) return { ok: false as const, error: "FRED_API_KEY missing" };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  const obs = (json.observations ?? []).filter((o) => o.value !== "." && !Number.isNaN(parseFloat(o.value)));
  if (!obs.length) return { ok: false as const, error: "no data" };
  return { ok: true as const, price: parseFloat(obs[0].value), date: obs[0].date };
}

async function probeRiksbank(seriesId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start.toISOString().slice(0, 10)}/${today}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
  const arr = (await res.json()) as Array<{ date: string; value: number }>;
  if (!Array.isArray(arr) || !arr.length) return { ok: false as const, error: "empty" };
  const sorted = [...arr].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  return { ok: true as const, price: last.value, date: last.date };
}

async function probeFrankfurter(from: string, to: string) {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const price = json.rates?.[to];
  if (typeof price !== "number") return { ok: false as const, error: "no rate" };
  return { ok: true as const, price, date: json.date ?? "unknown" };
}

async function probeCboe(file: string) {
  const url = `https://cdn.cboe.com/api/global/us_indices/daily_prices/${file}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
  const lines = (await res.text()).trim().split(/\r?\n/);
  const last = lines[lines.length - 1]?.split(",").map((c) => c.trim()) ?? [];
  const price = parseFloat(last[last.length - 1]);
  return { ok: true as const, price, date: last[0] ?? "unknown" };
}

function fmt(n: number | null | undefined, d = 4): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function daysSince(dateStr: string): number | null {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

async function main() {
  // Dynamic import to avoid createServerFn wrapper issues
  const mod = await import("../src/lib/markets.functions.ts");
  const TICKERS = [
    { symbol: "^TNX", label: "US 10Y Yield", category: "Rates", unit: "%", source: "yahoo" as const, fredFallbackId: "DGS10" },
    { symbol: "DGS2", label: "US 2Y Yield", category: "Rates", unit: "%", source: "fred" as const, fredId: "DGS2" },
    { symbol: "SEGVB10YC", label: "Sweden 10Y Yield", category: "Rates", unit: "%", source: "riksbank" as const, riksbankId: "SEGVB10YC" },
    { symbol: "SEGVB2YC", label: "Sweden 2Y Yield", category: "Rates", unit: "%", source: "riksbank" as const, riksbankId: "SEGVB2YC" },
    { symbol: "DX-Y.NYB", label: "US Dollar Index", category: "Forex", source: "yahoo" as const },
    { symbol: "SEK=X", label: "USD/SEK", category: "Forex", source: "frankfurter" as const, fxFrom: "USD", fxTo: "SEK" },
    { symbol: "EURSEK=X", label: "EUR/SEK", category: "Forex", source: "frankfurter" as const, fxFrom: "EUR", fxTo: "SEK" },
    { symbol: "^VIX", label: "VIX Index", category: "Volatility", source: "cboe" as const, cboeFile: "VIX_History.csv" },
  ];

  // Access fetchOne via re-import internals — it's not exported; call getMarkets handler path
  // Instead duplicate minimal fetch by importing module and using getMarkets if available
  const getMarkets = mod.getMarkets;
  let dashboardQuotes: Array<{
    symbol: string;
    label: string;
    price: number | null;
    error?: string;
    history: { date: string; price: number }[];
  }> = [];

  try {
    const handler = (getMarkets as { handler?: (args: unknown) => Promise<{ quotes: typeof dashboardQuotes; fetchedAt: string }> }).handler;
    if (handler) {
      const payload = await handler({});
      dashboardQuotes = payload.quotes;
      console.log(`Dashboard fetchedAt: ${payload.fetchedAt}\n`);
    }
  } catch (e) {
    console.warn("getMarkets handler failed, will skip dashboard comparison:", e);
  }

  console.log("=== MARKET DATA AUDIT ===\n");
  console.log("| Instrument | Dashboard | Source | Source value | Obs date | Match? | Freshness |");
  console.log("|---|---:|---|---:|---|:---:|:---:|");

  for (const a of AUDIT) {
    let sourceVal: number | null = null;
    let sourceDate = "—";
    let sourceName = a.primary;
    let probeNote = "";

    if (a.primary === "yahoo") {
      const p = await probeYahoo(a.symbol);
      if (p.ok) {
        sourceVal = p.price;
        sourceDate = `meta=${p.rawPrice ?? "n/a"} bar=${p.lastBarDate}`;
        probeNote = `lastBar=${p.lastBarClose}`;
      } else probeNote = p.error;
    } else if (a.primary === "fred" && "fred" in a) {
      const p = await probeFred(a.fred);
      if (p.ok) { sourceVal = p.price; sourceDate = p.date; }
      else probeNote = p.error;
    } else if (a.primary === "riksbank") {
      const p = await probeRiksbank(a.symbol);
      if (p.ok) { sourceVal = p.price; sourceDate = p.date; }
      else probeNote = p.error;
    } else if (a.primary === "frankfurter" && "fxFrom" in a) {
      const p = await probeFrankfurter(a.fxFrom, a.fxTo);
      if (p.ok) { sourceVal = p.price; sourceDate = p.date; }
      else probeNote = p.error;
    } else if (a.primary === "cboe" && "cboeFile" in a) {
      const p = await probeCboe(a.cboeFile);
      if (p.ok) { sourceVal = p.price; sourceDate = p.date; }
      else probeNote = p.error;
      // Also probe Yahoo VIX for comparison
      const yv = await probeYahoo("^VIX");
      if (yv.ok) probeNote += ` | Yahoo^VIX=${yv.price}@${yv.lastBarDate}`;
    }

  const dash = dashboardQuotes.find((q) => q.symbol === a.symbol || q.label === a.label);
    const dashVal = dash?.price ?? null;
    const match =
      dashVal != null && sourceVal != null
        ? Math.abs(dashVal - sourceVal) < (a.label.includes("Yield") || a.label.includes("VIX") ? 0.02 : 0.001)
          ? "YES"
          : "NO"
        : dash?.error
          ? "ERR"
          : "?";

    const histLast = dash?.history?.at(-1)?.date;
    const histDays = histLast ? daysSince(histLast) : null;
    let freshness = "unknown";
    if (dash?.error) freshness = "error/stale-cache";
    else if (a.primary === "cboe") freshness = `EOD prior close (${sourceDate})`;
    else if (a.primary === "fred") freshness = `FRED daily EOD (${sourceDate})`;
    else if (a.primary === "frankfurter") freshness = `ECB daily ref (${sourceDate})`;
    else if (a.primary === "riksbank") freshness = `Riksbank T-1 (${sourceDate})`;
    else if (histDays != null && histDays > 5) freshness = `stale history ${histDays.toFixed(1)}d`;
    else freshness = `live/delayed (${histLast ?? sourceDate})`;

    const digits = a.label.includes("SEK") ? 4 : a.label.includes("Yield") ? 3 : 2;
    console.log(
      `| ${a.label} | ${fmt(dashVal, digits)} | ${sourceName} | ${fmt(sourceVal, digits)} | ${sourceDate} | ${match} | ${freshness} |`,
    );
    if (probeNote) console.log(`  probe: ${probeNote}`);
    if (dash?.error) console.log(`  dash error: ${dash.error}`);
  }

  // FRED DGS10 vs ^TNX cross-check
  const dgs10 = await probeFred("DGS10");
  const tnx = await probeYahoo("^TNX");
  if (dgs10.ok && tnx.ok) {
    console.log(`\nUS 10Y cross-check: Yahoo ^TNX=${tnx.price} (bar ${tnx.lastBarDate}) vs FRED DGS10=${dgs10.price} (${dgs10.date}) delta=${((tnx.price ?? 0) - dgs10.price).toFixed(3)}pp`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
