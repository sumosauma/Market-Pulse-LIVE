/**
 * Local diagnostic — compare experimental Avanza EU500 source vs Yahoo.
 * Run: npm run test:eu500-source
 */

import { fetchEu500FromAvanza } from "../src/lib/equities/experimental/eu500RetailSource";

const YAHOO_TICKER = "EU500.AS";

async function fetchYahooEu500() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO_TICKER)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const meta = result?.meta ?? {};
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars = ts
    .map((t, i) => {
      const c = closes[i];
      return typeof c === "number" ? { date: new Date(t * 1000).toISOString().slice(0, 10), price: c } : null;
    })
    .filter((p): p is { date: string; price: number } => p != null);

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? null;
  const changePercent =
    price != null && prevClose != null && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : null;

  return { price, prevClose, changePercent, dailyBars: bars.length, bars };
}

function fmt(n: number | null | undefined, digits = 2): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
}

function pctDiff(a: number | null, b: number | null): string {
  if (a == null || b == null || b === 0) return "—";
  return `${(((a - b) / b) * 100).toFixed(3)}% vs other`;
}

async function main() {
  console.log("=== EU500 retail source PoC (Avanza) ===\n");

  const [avanza, yahoo] = await Promise.all([fetchEu500FromAvanza(), fetchYahooEu500()]);

  console.log("--- Avanza (experimental) ---");
  console.log("orderBookId:", avanza.orderBookId);
  console.log("daily bars:", avanza.history.length);
  console.log("first date:", avanza.history[0]?.date ?? "—");
  console.log("last date:", avanza.history.at(-1)?.date ?? "—");
  console.log("latest close:", fmt(avanza.price));
  console.log("previous close:", fmt(avanza.previousClose));
  console.log("1D % (Avanza):", fmt(avanza.changePercent, 4));
  if (avanza.error) console.log("error:", avanza.error);

  console.log("\n--- Yahoo EU500.AS (production) ---");
  console.log("daily bars:", yahoo.dailyBars);
  console.log("latest price:", fmt(yahoo.price));
  console.log("chartPreviousClose:", fmt(yahoo.prevClose));
  console.log("1D % (Yahoo meta):", fmt(yahoo.changePercent, 4));

  console.log("\n--- Consistency check ---");
  console.log("price delta:", pctDiff(avanza.price, yahoo.price));
  console.log("prev close delta:", pctDiff(avanza.previousClose, yahoo.prevClose));
  console.log("1D % delta (Avanza − Yahoo):", fmt((avanza.changePercent ?? 0) - (yahoo.changePercent ?? 0), 4), "pp");

  const lastTwo = avanza.history.slice(-2);
  if (lastTwo.length === 2) {
    const calc = ((lastTwo[1]!.price - lastTwo[0]!.price) / lastTwo[0]!.price) * 100;
    console.log("1D % from Avanza last 2 bars:", fmt(calc, 4));
  }

  console.log("\n--- Nordnet ---");
  console.log("instrument search API: requires session (401 NEXT_INVALID_SESSION)");
  console.log("public instrument page: not resolved without login/search API");

  console.log("\n--- Recommendation ---");
  if (avanza.history.length >= 6 && avanza.changePercent != null) {
    console.log("Avanza public JSON provides sufficient daily history for local testing.");
    console.log("Not recommended as default production source (unofficial API, beQuoted feed).");
  } else {
    console.log("Insufficient data — keep EU500 unavailable in production.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
