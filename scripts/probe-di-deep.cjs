const UA = "Mozilla/5.0 (compatible; probe/1.0)";

async function analyzeMarketJs() {
  const url = "https://www.di.se/scripts/market.desktop__c0dd68dfb1c1d0ade49df2b982ddb2793.js";
  const t = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const urls = [...new Set([...t.matchAll(/https?:\/\/[^\s"'\\]+/g)].map((m) => m[0]))].filter((u) =>
    /api|millistream|chart|history|quote|instrument|insref|market/i.test(u),
  );
  const paths = [...new Set([...t.matchAll(/["'](\/[^"'\\]{4,100})["']/g)].map((m) => m[1]))].filter((p) =>
    /api|chart|history|quote|instrument|market|millistream|graph/i.test(p),
  );
  const keywords = ["insref", "millistream", "pricehistory", "chartdata", "history", "quote", "xhr", "fetch\\("];
  const keywordHits = {};
  for (const k of keywords) {
    keywordHits[k] = (t.match(new RegExp(k, "gi")) || []).length;
  }
  return { jsLen: t.length, urls: urls.slice(0, 30), paths: paths.slice(0, 40), keywordHits };
}

function parseSwedishNumber(s) {
  return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

async function parseInstrumentPage(name, url, slugId) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const insref = html.match(/data-insref="(\d+)"/)?.[1] ?? slugId;
  const asOf = html.match(/\d{1,2}\s+[a-zåäö]+\s+\d{4},\s*\d{2}:\d{2}/i)?.[0] ?? null;

  // instrument headline numbers often in market-quote blocks
  const quoteBlock =
    html.match(/market-quote[\s\S]{0,1200}/i)?.[0] ??
    html.match(/instrument__[\s\S]{0,1200}/i)?.[0] ??
    "";

  const pctMatch = html.match(/([+-]?\d+[,.]?\d*)\s*%[^<]{0,40}-ENH/i) ?? html.match(/([+-][\d,]+)%/);
  const bigNum = html.match(/>([\d\s]{1,3}(?:[\s\u00a0]?\d{3})*[,.]\d{1,4})<\//);

  // table row for 1 v (1 week)
  const weekCol = html.match(/1 v[\s\S]{0,2000}/i)?.[0] ?? "";
  const tableRows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0].replace(/\s+/g, " ").slice(0, 200));

  // Try to find instrument name heading content
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null;

  return {
    name,
    url,
    title,
    insref,
    asOf,
    headlineNumber: bigNum ? bigNum[1].trim() : null,
    changePctRaw: pctMatch ? pctMatch[1] : null,
    quoteBlockSnippet: quoteBlock.replace(/\s+/g, " ").slice(0, 350),
    tableRowCount: tableRows.length,
    millistream15min: /fördröjd med 15 minuter/i.test(html),
    pristypeSpot: /Spot/i.test(html),
  };
}

(async () => {
  const js = await analyzeMarketJs();
  const pages = await Promise.all([
    parseInstrumentPage("SP500", "https://www.di.se/bors/index/inx-72823/", "72823"),
    parseInstrumentPage("US10Y", "https://www.di.se/rantor/us10y-4733793/", "4733793"),
    parseInstrumentPage("Gold", "https://www.di.se/ravaror/xauusd-4606816/", "4606816"),
    parseInstrumentPage("Brent", "https://www.di.se/ravaror/ukoilusd-4606814/", "4606814"),
  ]);

  // references at probe time
  const refs = {};
  async function yahoo(sym) {
    const j = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
    ).then((r) => r.json());
    return j.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  }
  refs.yahooGspc = await yahoo("^GSPC");
  refs.yahooTnx = await yahoo("^TNX");
  refs.yahooBz = await yahoo("BZ=F");
  refs.goldApi = (await fetch("https://api.gold-api.com/price/XAU").then((r) => r.json())).price;

  console.log(JSON.stringify({ js, pages, refs, probedAt: new Date().toISOString() }, null, 2));
})();
