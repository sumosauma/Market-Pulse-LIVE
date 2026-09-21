import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const UA = "Mozilla/5.0";
const key = process.env.FRED_API_KEY;
const today = new Date().toISOString().slice(0, 10);
const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

async function yahoo(sym) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2y`,
    { signal: AbortSignal.timeout(12_000) },
  );
  const j = await r.json();
  const res = j.chart?.result?.[0];
  const price = res?.meta?.regularMarketPrice;
  const ts = res?.timestamp ?? [];
  const cl = res?.indicators?.quote?.[0]?.close ?? [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (typeof c === "number") pts.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), price: c });
  }
  let p = price;
  if (sym === "^TNX" && typeof p === "number" && p > 30) p /= 10;
  const hist = pts.slice(-6);
  const last = hist.at(-1)?.date ?? "";
  const days = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : null;
  const freshFlag = last >= fiveDaysAgo ? "fresh" : "stale-history";
  return { p, last, hist, days, uiStale: days != null && days > 5, freshFlag };
}

async function fred(id) {
  const r = await fetch(
    `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=6`,
    { signal: AbortSignal.timeout(12_000) },
  );
  const j = await r.json();
  const obs = (j.observations ?? []).filter((o) => o.value !== ".");
  const asc = obs.slice().reverse().map((o) => ({ date: o.date, price: parseFloat(o.value) }));
  const hist = asc.slice(-6);
  const days = (Date.now() - new Date(obs[0].date).getTime()) / 86_400_000;
  return { p: parseFloat(obs[0].value), date: obs[0].date, hist, days, uiStale: days > 5 };
}

async function riks(id) {
  const s = new Date();
  s.setDate(s.getDate() - 30);
  const r = await fetch(
    `https://api.riksbank.se/swea/v1/Observations/${id}/${s.toISOString().slice(0, 10)}/${today}`,
    { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(12_000) },
  );
  const arr = await r.json();
  const sorted = [...arr].sort((a, b) => (a.date < b.date ? -1 : 1));
  const hist = sorted.slice(-6).map((o) => ({ date: o.date, price: o.value }));
  const last = sorted.at(-1);
  const days = (Date.now() - new Date(last.date).getTime()) / 86_400_000;
  return { p: last.value, date: last.date, hist, days, uiStale: days > 5 };
}

async function fx(from, to) {
  const r = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, { signal: AbortSignal.timeout(12_000) });
  const j = await r.json();
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const hr = await fetch(
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}?from=${from}&to=${to}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  const hj = await hr.json();
  const entries = Object.entries(hj.rates ?? {})
    .map(([d, rates]) => ({ date: d, price: rates[to] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const hist = entries.slice(-6);
  const days = (Date.now() - new Date(j.date).getTime()) / 86_400_000;
  return { p: j.rates[to], date: j.date, hist, days, uiStale: days > 5 };
}

async function cboe(file) {
  const r = await fetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${file}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12_000),
  });
  const lines = (await r.text()).trim().split(/\r?\n/).slice(1);
  const pts = lines
    .map((l) => {
      const c = l.split(",").map((x) => x.trim());
      return { date: c[0], price: parseFloat(c[c.length - 1]) };
    })
    .filter((p) => !Number.isNaN(p.price));
  const hist = pts.slice(-6);
  const last = pts.at(-1);
  const days = (Date.now() - new Date(last.date).getTime()) / 86_400_000;
  const freshFlag = last.date >= fiveDaysAgo ? "fresh" : "stale-history";
  return { p: last.price, date: last.date, hist, days, uiStale: days > 5, freshFlag };
}

const rows = [
  ["US Dollar Index (DXY)", "yahoo", () => yahoo("DX-Y.NYB")],
  [
    "US 10Y Yield",
    "yahoo",
    async () => {
      const y = await yahoo("^TNX");
      const f = await fred("DGS10");
      return { ...y, fred: f.p, fredDate: f.date, fredDelta: y.p != null ? y.p - f.p : null };
    },
  ],
  ["US 2Y Yield", "fred", () => fred("DGS2")],
  ["Sweden 10Y Yield", "riksbank", () => riks("SEGVB10YC")],
  ["Sweden 2Y Yield", "riksbank", () => riks("SEGVB2YC")],
  ["USD/SEK", "frankfurter", () => fx("USD", "SEK")],
  ["EUR/SEK", "frankfurter", () => fx("EUR", "SEK")],
  [
    "VIX Index",
    "cboe",
    async () => {
      const c = await cboe("VIX_History.csv");
      const y = await yahoo("^VIX");
      return { ...c, yahooLive: y.p, yahooDate: y.last, yahooDelta: c.p - y.p };
    },
  ],
];

console.log(`Probe run at ${new Date().toISOString()}\n`);
for (const [name, src, fn] of rows) {
  const x = await fn();
  console.log(`--- ${name} ---`);
  console.log(JSON.stringify({ primarySource: src, ...x }, null, 2));
}
