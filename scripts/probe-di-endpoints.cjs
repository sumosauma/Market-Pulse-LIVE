const UA = "Mozilla/5.0 (compatible; probe/1.0)";

async function fetchJsContext() {
  const js = await fetch(
    "https://www.di.se/scripts/market.desktop__c0dd68dfb1c1d0ade49df2b982ddb2793.js",
    { headers: { "User-Agent": UA } },
  ).then((r) => r.text());

  const terms = ["instrument-history", "ghostgraph", "market/instrument", "insref", "Millistream"];
  const hits = {};
  for (const term of terms) {
    const idxs = [];
    let i = 0;
    while ((i = js.indexOf(term, i)) !== -1 && idxs.length < 8) {
      idxs.push(js.slice(Math.max(0, i - 100), i + 180).replace(/\s+/g, " "));
      i += term.length;
    }
    hits[term] = idxs;
  }
  return hits;
}

async function tryEndpoint(label, url, opts = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json, */*", ...opts.headers },
    method: opts.method || "GET",
    body: opts.body,
  });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text();
  return {
    label,
    url,
    method: opts.method || "GET",
    status: r.status,
    ct,
    len: text.length,
    isJson: ct.includes("json") || /^[\[{]/.test(text.trim()),
    preview: text.slice(0, 400),
  };
}

async function parsePage(name, url) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const asOf = html.match(/(\d{1,2}\s+[a-zåäö]+\s+\d{4},\s*\d{2}:\d{2})/i)?.[1] ?? null;
  const h1Block = html.match(/<h2[^>]*>([^<]+)<\/h2>[\s\S]{0,800}/i)?.[0] ?? "";
  const headline = h1Block.match(/([\d\s]{1,3}(?:[\s\u00a0]?\d{3})*(?:[,.]\d+)?)/)?.[1]?.trim() ?? null;
  const pct = html.match(/([+-]?\d+[,.]?\d*)\s*%/)?.[1] ?? null;
  const unit = html.match(/USD\/[^<\s]+/i)?.[0] ?? html.match(/%/i) ? "percent" : null;
  return { name, url, asOf, headline, pct, unitSnippet: unit };
}

(async () => {
  const jsHits = await fetchJsContext();

  const endpointTests = await Promise.all([
    tryEndpoint("GET instrument-history bare", "https://www.di.se/market/instrument-history/"),
    tryEndpoint(
      "POST instrument-history insref",
      "https://www.di.se/market/instrument-history/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "insref=72823&interval=day",
      },
    ),
    tryEndpoint(
      "POST instrument-history json body",
      "https://www.di.se/market/instrument-history/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insref: 72823, interval: "day" }),
      },
    ),
    tryEndpoint("GET ghostgraph", "https://www.di.se/stock/ghostgraph/?insref=72823"),
    tryEndpoint(
      "POST ghostgraph",
      "https://www.di.se/stock/ghostgraph/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "insref=72823",
      },
    ),
  ]);

  const pages = await Promise.all([
    parsePage("SP500", "https://www.di.se/bors/index/inx-72823/"),
    parsePage("US10Y", "https://www.di.se/rantor/us10y-4733793/"),
    parsePage("Gold", "https://www.di.se/ravaror/xauusd-4606816/"),
    parsePage("Brent", "https://www.di.se/ravaror/ukoilusd-4606814/"),
  ]);

  console.log(JSON.stringify({ jsHits, endpointTests, pages, probedAt: new Date().toISOString() }, null, 2));
})();
