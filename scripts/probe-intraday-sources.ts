const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function probe(name: string, url: string) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    console.log("\n===", name, "HTTP", r.status, "len", text.length);
    if (text.length < 2500) console.log(text.slice(0, 2000));
    else {
      const j = JSON.parse(text) as { ohlc?: unknown[]; hits?: unknown[] };
      if (Array.isArray(j.ohlc)) {
        console.log("ohlc bars", j.ohlc.length, "first", j.ohlc[0], "last", j.ohlc[j.ohlc.length - 1]);
      } else {
        console.log(JSON.stringify(j).slice(0, 1500));
      }
    }
  } catch (e) {
    console.log(name, "ERR", e instanceof Error ? e.message : e);
  }
}

await probe("avanza search OMXC25", "https://www.avanza.se/_api/search/search?query=OMXC25");
await probe("avanza search Copenhagen", "https://www.avanza.se/_api/search/search?query=K%C3%B8benhavn%2025");

for (const id of ["53547", "53549", "53550", "53551", "53552", "19002", "19003", "19004"]) {
  await probe(`avanza chart ${id}`, `https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=today&resolution=five_minutes`);
}

await probe("nasdaq NQZA info", "https://api.nasdaq.com/api/quote/NQZA/info?assetclass=index");
await probe(
  "nasdaq NQZA chart",
  "https://api.nasdaq.com/api/quote/NQZA/chart?assetclass=index&fromdate=2026-05-20&todate=2026-05-25&limit=400",
);
await probe("nasdaq OMXC25 info", "https://api.nasdaq.com/api/quote/OMXC25/info?assetclass=index");
await probe(
  "nasdaq OMXC25 chart",
  "https://api.nasdaq.com/api/quote/OMXC25/chart?assetclass=index&fromdate=2026-05-20&todate=2026-05-25&limit=400",
);
