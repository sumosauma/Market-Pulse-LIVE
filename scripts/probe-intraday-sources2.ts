const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function getJson(name: string, url: string) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const j = await r.json();
    console.log("\n===", name, "HTTP", r.status);
    console.log(JSON.stringify(j).slice(0, 2500));
    return j;
  } catch (e) {
    console.log(name, "ERR", e instanceof Error ? e.message : e);
    return null;
  }
}

for (const id of ["53547", "53548", "19002", "19001", "19005", "53546", "53545"]) {
  await getJson(`market-index ${id}`, `https://www.avanza.se/_api/market-index/${id}`);
}

// Alternative search endpoints
await getJson("search-query v1", "https://www.avanza.se/_mobile/market/search/OMXC25");
await getJson("search-query v2", "https://www.avanza.se/_api/search/global-search/OMXC25");

// Nasdaq Nordic indices list?
await getJson("nasdaq nordic indices", "https://api.nasdaq.com/api/quote/list?assetclass=index&exchange=OMX");

// Investing.com or other - skip per user request

// Try Yahoo alternative tickers for Denmark
for (const t of ["OMXC25.CO", "OMXC25.CPH", "DK25.CO"]) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=30m&range=5d`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp?.length ?? 0;
  const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((c: unknown) => typeof c === "number").length;
  console.log("\nYahoo", t, "raw", ts, "valid", closes, "name", res?.meta?.shortName ?? res?.meta?.symbol);
}

// NQZA alternatives on Yahoo
for (const t of ["^NQZA", "NQZA", "JSE.JO"]) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=30m&range=5d`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp?.length ?? 0;
  const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((c: unknown) => typeof c === "number").length;
  console.log("\nYahoo", t, "raw", ts, "valid", closes);
}

// Stooq or other for NQZA - user said official first

// JSE / Nasdaq global index API
await getJson("nasdaq global NQZA", "https://indexes.nasdaqomx.com/index/History?indexId=NQZA");
