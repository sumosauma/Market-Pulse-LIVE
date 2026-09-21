const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function tryUrl(path: string) {
  const url = `https://www.avanza.se${path}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    console.log(path, r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.log(path, "err");
  }
}

for (const p of [
  "/_api/market-index-list",
  "/_api/market-index/list",
  "/_api/market/index-list",
  "/_mobile/market/index/list",
  "/_api/market/index/DK",
]) {
  await tryUrl(p);
}

async function meta(id: string) {
  const r = await fetch(`https://www.avanza.se/_api/market-index/${id}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { name?: string; listing?: { tickerSymbol?: string; countryCode?: string } };
  return { id, name: j.name, ticker: j.listing?.tickerSymbol, cc: j.listing?.countryCode };
}

// Broader scan: known OMX indices often in 190xx (FI/NO/DK?)
console.log("\nScan 19010-19080 stepping by 1 for INDEX with country DK or name Copenhagen/OMX");
for (let id = 19010; id <= 19080; id++) {
  const m = await meta(String(id));
  if (!m) continue;
  const n = (m.name ?? "").toLowerCase();
  if (m.cc === "DK" || n.includes("copenhagen") || n.includes("omxc") || n.includes("denmark") || (m.ticker ?? "").includes("OMXC")) {
    console.log(JSON.stringify(m));
  }
}

console.log("\nScan 52850-52950 for DK indices");
for (let id = 52850; id <= 52950; id++) {
  const m = await meta(String(id));
  if (!m) continue;
  if (m.cc === "DK" && (m.name ?? "").toLowerCase().includes("index")) {
    console.log(JSON.stringify(m));
  }
}

// Nasdaq Nordic historical API
const nordicUrls = [
  "https://www.nasdaqomxnordic.com/index/indexChart?index=DK0016260434",
  "https://api.nasdaq.com/api/quote/OMXC25/info?assetclass=index&exchange=OMX",
];
for (const url of nordicUrls) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    console.log("\n", url, r.status, (await r.text()).slice(0, 400));
  } catch {}
}
