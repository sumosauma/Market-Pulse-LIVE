const fs = require("fs");
const UA = "Mozilla/5.0 (compatible; probe/1.0)";

async function analyzePage(name, url) {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const fetchUrls = [...new Set([...html.matchAll(/fetch\(["']([^"']+)["']/g)].map((m) => m[1]))];
  const xhrUrls = [...new Set([...html.matchAll(/(?:axios|get|post)\(["']([^"']+)["']/g)].map((m) => m[1]))];
  const highchartsData = html.includes("Highcharts") || html.includes("highcharts");
  const seriesMatch = html.match(/series\s*:\s*\[/);
  const priceMatch = html.match(/Senast[\s\S]{0,200}?(\d[\d\s.,]+)/i);
  const h1Block = html.match(/<h2[^>]*>[\s\S]{0,500}?<\/h2>/i)?.[0]?.replace(/\s+/g, " ").slice(0, 300);
  return {
    name,
    url,
    htmlLen: html.length,
    scriptCount: scripts.length,
    scriptSamples: scripts.slice(0, 8),
    fetchUrls: fetchUrls.slice(0, 20),
    xhrUrls: xhrUrls.slice(0, 10),
    highchartsData,
    hasInlineSeries: !!seriesMatch,
    h1Block,
    contains7519: html.includes("7519") || html.includes("7 519") || html.includes("7473"),
    contains450: html.includes("4,50") || html.includes("4.50") || html.includes("4,49"),
  };
}

async function tryDiGraphql() {
  const endpoints = [
    "https://www.di.se/graphql",
    "https://api.di.se/graphql",
    "https://www.di.se/api/graphql",
  ];
  const out = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      out.push({ url, status: res.status, body: (await res.text()).slice(0, 150) });
    } catch (e) {
      out.push({ url, error: String(e) });
    }
  }
  return out;
}

async function fetchOverviewValues() {
  const pages = {
    index: "https://www.di.se/bors/index/",
    rates: "https://www.di.se/rantor/",
    commodities: "https://www.di.se/ravaror/",
  };
  const out = {};
  for (const [k, url] of Object.entries(pages)) {
    const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
    const extractRow = (label) => {
      const re = new RegExp(label + "[\\s\\S]{0,120}?([\\d\\s.,]+)\\s*\\|\\s*([+-]?[\\d\\s.,]+%)", "i");
      const m = html.match(re);
      return m ? { value: m[1].trim(), change: m[2].trim() } : null;
    };
    out[k] = {
      sp500: extractRow("S&P 500"),
      us10y: extractRow("Statsobligation 10 år"),
      gold: extractRow("Guld"),
      brent: extractRow("Brentolja"),
    };
  }
  return out;
}

(async () => {
  const pages = await Promise.all([
    analyzePage("SP500", "https://www.di.se/bors/index/inx-72823/"),
    analyzePage("US10Y", "https://www.di.se/rantor/us10y-4733793/"),
    analyzePage("Gold", "https://www.di.se/ravaror/xauusd-4606816/"),
    analyzePage("Brent", "https://www.di.se/ravaror/ukoilusd-4606814/"),
  ]);
  const graphql = await tryDiGraphql();
  const overview = await fetchOverviewValues();
  console.log(JSON.stringify({ pages, graphql, overview }, null, 2));
})();
