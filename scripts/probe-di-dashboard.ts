/**
 * One-off DI probe for dashboard instruments — report only.
 */
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* optional */
}

const UA = "Mozilla/5.0 (compatible; MarketPulse-DI-probe/1.0)";

const INSTRUMENTS = [
  {
    key: "SP500",
    pageUrl: "https://www.di.se/bors/index/inx-72823/",
    slugId: "72823",
    diSymbol: "INX",
  },
  {
    key: "US10Y",
    pageUrl: "https://www.di.se/rantor/us10y-4733793/",
    slugId: "4733793",
    diSymbol: "US10Y",
  },
  {
    key: "Gold",
    pageUrl: "https://www.di.se/ravaror/xauusd-4606816/",
    slugId: "4606816",
    diSymbol: "XAUUSD",
  },
  {
    key: "Brent",
    pageUrl: "https://www.di.se/ravaror/ukoilusd-4606814/",
    slugId: "4606814",
    diSymbol: "UKOILUSD",
  },
] as const;

async function fetchText(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*", ...headers },
  });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get("content-type"), text };
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, contentType: res.headers.get("content-type"), json, textPreview: text.slice(0, 300) };
}

function extractPatterns(html: string) {
  const urls = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    const u = m[0];
    if (/api|millistream|graphql|\.json|insref|instrument|quote|chart|history/i.test(u)) {
      urls.add(u.slice(0, 200));
    }
  }
  for (const m of html.matchAll(/["'](\/[^"'\\]*(?:api|graphql|instrument|quote|chart|history)[^"'\\]*)["']/gi)) {
    urls.add(`https://www.di.se${m[1]}`);
  }
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]!)
    .filter((s) => s.length < 500_000);
  let embeddedJson: unknown = null;
  for (const s of scripts) {
    if (s.includes("__NEXT_DATA__")) {
      const m = s.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (m) {
        try {
          embeddedJson = JSON.parse(m[1]!);
        } catch {
          /* skip */
        }
      }
    }
    if (s.includes("window.__INITIAL") || s.includes("window.__DATA")) {
      embeddedJson = embeddedJson ?? "has window bootstrap";
    }
  }
  const insrefs = [...new Set([...html.matchAll(/insref[=:"'\s]+(\d+)/gi)].map((m) => m[1]!))].slice(0, 10);
  return { urls: [...urls].slice(0, 15), insrefs, hasNextData: html.includes("__NEXT_DATA__"), embeddedJsonSnippet: embeddedJson ? "found" : null };
}

async function yahooPrice(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = (await fetch(url).then((r) => r.json())) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> };
  };
  const r = json.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice ?? null;
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const points: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number") points.push(c);
  }
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = ts.length ? new Date(ts[ts.length - 1]! * 1000).toISOString().slice(0, 10) : "";
  const prev = lastDate === today ? points.at(-2) ?? null : points.at(-1) ?? null;
  return { price, prevClose: prev, changePct: price != null && prev ? ((price - prev) / prev) * 100 : null };
}

async function fredLatest(series: string) {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key}&file_type=json&sort_order=desc&limit=3`;
  const json = (await fetch(url).then((r) => r.json())) as { observations?: { date: string; value: string }[] };
  return (json.observations ?? [])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

async function probeDiApiCandidates(slugId: string) {
  const candidates = [
    `https://www.di.se/api/instrument/${slugId}`,
    `https://www.di.se/api/instruments/${slugId}`,
    `https://www.di.se/api/quote/${slugId}`,
    `https://www.di.se/api/marketdata/instrument/${slugId}`,
    `https://www.di.se/api/marketdata/${slugId}`,
    `https://www.di.se/api/chart/${slugId}`,
    `https://www.di.se/api/history/${slugId}`,
    `https://api.di.se/instrument/${slugId}`,
    `https://api.di.se/market/${slugId}`,
    `https://www.di.se/_api/instrument/${slugId}`,
    `https://www.di.se/_api/market/instrument/${slugId}`,
    `https://www.di.se/bors/api/instrument/${slugId}`,
    `https://www.di.se/ravaror/api/${slugId}`,
    `https://www.di.se/rantor/api/${slugId}`,
    // Millistream public (expected auth fail)
    `https://api.millistream.com/mws/?cmd=quote&insref=${slugId}&format=json`,
    `https://api.millistream.com/mws/?cmd=history&insref=${slugId}&format=json`,
  ];
  const results = [];
  for (const url of candidates) {
    try {
      const r = await fetchJson(url);
      results.push({
        url: url.replace(/usr=.*|pwd=.*|token=.*/, "…"),
        status: r.status,
        contentType: r.contentType,
        isJson: r.json !== null,
        preview: r.textPreview.replace(/\s+/g, " ").slice(0, 120),
      });
    } catch (e) {
      results.push({
        url,
        status: "ERR",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

async function main() {
  const report: Record<string, unknown> = { probedAt: new Date().toISOString() };

  for (const inst of INSTRUMENTS) {
    const page = await fetchText(inst.pageUrl);
    const patterns = extractPatterns(page.text);
    const apiCandidates = await probeDiApiCandidates(inst.slugId);

    const loginWall = /logga in|prenumerant|Skapa konto/i.test(page.text) && !/Senast|Millistream|fördröjd/i.test(page.text.slice(0, 5000));
    const accessible = page.status === 200 && page.text.length > 5000;

    report[inst.key] = {
      pageUrl: inst.pageUrl,
      diSymbol: inst.diSymbol,
      slugId: inst.slugId,
      pageStatus: page.status,
      accessibleWithoutLogin: accessible,
      loginPromptPresent: /logga in|Skapa konto utan kostnad/i.test(page.text),
      millistreamDisclaimer: /Millistream|fördröjd med 15 minuter/i.test(page.text),
      htmlPatterns: patterns,
      apiCandidates: apiCandidates.filter((c) => c.status !== 404).slice(0, 8),
      apiCandidates404Count: apiCandidates.filter((c) => c.status === 404).length,
    };
  }

  report.references = {
    yahooGspc: await yahooPrice("^GSPC"),
    yahooTnx: await yahooPrice("^TNX"),
    yahooBz: await yahooPrice("BZ=F"),
    yahooGc: await yahooPrice("GC=F"),
    goldApi: await fetchJson("https://api.gold-api.com/price/XAU"),
    fredSp500: await fredLatest("SP500"),
    fredDgs10: await fredLatest("DGS10"),
  };

  // Try DI overview pages that list values in HTML tables
  const overviewPages = [
    ["indexOverview", "https://www.di.se/bors/index/"],
    ["ratesOverview", "https://www.di.se/rantor/"],
    ["commoditiesOverview", "https://www.di.se/ravaror/"],
  ];
  report.overviewPages = {};
  for (const [name, url] of overviewPages) {
    const p = await fetchText(url);
    report.overviewPages[name] = {
      status: p.status,
      accessible: p.status === 200,
      millistream: /Millistream|15 min/i.test(p.text),
      hasTable: /<table/i.test(p.text),
    };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
