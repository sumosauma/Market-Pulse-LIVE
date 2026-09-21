const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function indexMeta(id: string) {
  try {
    const r = await fetch(`https://www.avanza.se/_api/market-index/${id}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { name?: string; listing?: { tickerSymbol?: string } };
    return { id, name: j.name, ticker: j.listing?.tickerSymbol };
  } catch {
    return null;
  }
}

async function chartBars(id: string) {
  try {
    const r = await fetch(
      `https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=today&resolution=five_minutes`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return 0;
    const j = (await r.json()) as { ohlc?: unknown[] };
    return j.ohlc?.length ?? 0;
  } catch {
    return 0;
  }
}

console.log("Scanning Avanza index IDs 19006-19040...");
for (let id = 19006; id <= 19040; id++) {
  const m = await indexMeta(String(id));
  if (m) {
    const bars = await chartBars(String(id));
    console.log(id, m.name, m.ticker, "bars", bars);
  }
}

console.log("\nScanning 52800-52900 (DK area from OMXN40 constituents?)...");
for (let id = 52800; id <= 52900; id += 5) {
  const m = await indexMeta(String(id));
  if (m?.name?.toLowerCase().includes("copenhagen") || m?.name?.toLowerCase().includes("omxc") || m?.ticker?.includes("OMXC")) {
    const bars = await chartBars(String(id));
    console.log(id, m.name, m.ticker, "bars", bars);
  }
}

// Yahoo SA tickers
const saTickers = ["^NQZA", "NQZA.JO", "^J203.JO", "JSE.JO", "^JN0U.JO", "SA40.JO", "^SA40", "TOP40.JO"];
for (const t of saTickers) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=30m&range=5d`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    const res = j.chart?.result?.[0];
    if (!res) {
      console.log("Yahoo", t, "no result");
      continue;
    }
    const ts = res.timestamp?.length ?? 0;
    const closes = (res.indicators?.quote?.[0]?.close ?? []).filter((c: unknown) => typeof c === "number");
    const first = closes.length ? new Date(res.timestamp[0] * 1000).toISOString() : null;
    const last = closes.length ? new Date(res.timestamp[closes.length - 1] * 1000).toISOString() : null;
    console.log("Yahoo", t, "raw", ts, "valid", closes.length, "shortName", res.meta?.shortName, "first", first, "last", last);
  } catch (e) {
    console.log("Yahoo", t, "err");
  }
}
