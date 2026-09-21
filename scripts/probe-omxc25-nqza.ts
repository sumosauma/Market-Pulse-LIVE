const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";
const id = "731293";

async function chart(period: string, res: string) {
  const url = `https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=${period}&resolution=${res}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const j = (await r.json()) as { ohlc?: { timestamp: number; close: number }[] };
  const o = j.ohlc ?? [];
  console.log(period, res, "bars", o.length, "first", o[0], "last", o[o.length - 1]);
}

await chart("today", "five_minutes");
await chart("today", "minute");
await chart("five_days", "thirty_minutes");

const mi = await fetch(`https://www.avanza.se/_api/market-index/${id}`, {
  headers: { "User-Agent": UA, Accept: "application/json" },
});
console.log("market-index", (await mi.text()).slice(0, 800));

for (const q of ["NQZA", "South Africa", "Nasdaq South Africa"]) {
  const search = await fetch("https://www.avanza.se/_api/search/filtered-search", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, searchFilter: { types: ["INDEX"] }, limit: 10 }),
  });
  console.log("\nsearch", q, (await search.text()).slice(0, 600));
}

// FRED doesn't have intraday - skip

// Try Nasdaq data link for NQZA
await fetch("https://data.nasdaq.com/api/v3/datasets/NASDAQ/NQZA.json?limit=1", {
  headers: { "User-Agent": UA },
}).then(async (r) => console.log("\nnasdaq data link", r.status, (await r.text()).slice(0, 400)));
