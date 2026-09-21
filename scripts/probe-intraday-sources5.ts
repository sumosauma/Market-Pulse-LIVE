const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function get(name: string, url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    console.log("\n===", name, r.status, text.slice(0, 1200));
    return text;
  } catch (e) {
    console.log(name, "ERR", e instanceof Error ? e.message : e);
    return null;
  }
}

// Avanza mobile search (public, no auth?)
for (const q of ["omxc25", "copenhagen", "omx%20copenhagen", "k%C3%B8benhavn"]) {
  await get(`mobile search ${q}`, `https://www.avanza.se/_mobile/market/search/${q}`);
}

// Avanza filtered search POST (from newer API)
await get(
  "filtered search INDEX",
  "https://www.avanza.se/_api/search/filtered-search",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "OMXC25",
      searchFilter: { types: ["INDEX"] },
      limit: 10,
    }),
  },
);

await get(
  "filtered search Copenhagen",
  "https://www.avanza.se/_api/search/filtered-search",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "Copenhagen 25",
      searchFilter: { types: ["INDEX"] },
      limit: 10,
    }),
  },
);

// Nasdaq Nordic index info - try symbol variants
for (const sym of ["OMXC25", "OMXC25DKK", "OMXC25CPH", "DKOMXC25"]) {
  await get(`nasdaq ${sym}`, `https://api.nasdaq.com/api/quote/${sym}/info?assetclass=index`);
}

// Nasdaq Nordic data portal - common pattern
await get(
  "nordic indexinfo",
  "https://www.nasdaqomxnordic.com/webproxy/DataFeedProxy1/marketwatch/indexes?index=OMXC25",
);

// Try mobile chart for candidate IDs if we find them
for (const id of ["19007", "19008", "19009", "19012", "19015", "19020", "19025", "19030"]) {
  await get(`mobile chart ${id}`, `https://www.avanza.se/_mobile/chart/orderbook/${id}?timePeriod=today`);
}
