const UA = "Mozilla/5.0 (compatible; probe/1.0)";

const instruments = [
  { name: "SP500", insref: "72823", page: "https://www.di.se/bors/index/inx-72823/", diSymbol: "INX" },
  { name: "US10Y", insref: "4733793", page: "https://www.di.se/rantor/us10y-4733793/", diSymbol: "US10Y" },
  { name: "Gold", insref: "4606816", page: "https://www.di.se/ravaror/xauusd-4606816/", diSymbol: "XAUUSD" },
  { name: "Brent", insref: "4606814", page: "https://www.di.se/ravaror/ukoilusd-4606814/", diSymbol: "UKOILUSD" },
];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  return { status: r.status, ct: r.headers.get("content-type"), json: r.ok ? await r.json() : null };
}

function lastPoint(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const [ts, val] = points[points.length - 1];
  return { ts, iso: new Date(ts).toISOString(), val, count: points.length };
}

function firstRecent(points, days = 7) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const lastTs = points[points.length - 1][0];
  const cutoff = lastTs - days * 86400000;
  const recent = points.filter((p) => p[0] >= cutoff);
  return { recentCount: recent.length, first: recent[0], last: recent[recent.length - 1] };
}

async function yahoo(sym) {
  const j = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
  ).then((r) => r.json());
  const meta = j.chart?.result?.[0]?.meta;
  return {
    price: meta?.regularMarketPrice,
    prevClose: meta?.chartPreviousClose ?? meta?.previousClose,
    time: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

async function fred(id) {
  const key = process.env.FRED_API_KEY || "";
  if (!key) return { note: "no FRED_API_KEY" };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&sort_order=desc&limit=3&api_key=${key}&file_type=json`;
  const j = await fetch(url).then((r) => r.json());
  return (j.observations || []).map((o) => ({ date: o.date, value: Number(o.value) }));
}

function parseSwedishHeadline(html) {
  const asOf = html.match(/(\d{1,2}\s+[a-zåäö]+\s+\d{4},\s*\d{2}:\d{2})/i)?.[1] ?? null;
  const h2 = html.match(/<h2[^>]*>[\s\S]*?<\/h2>[\s\S]{0,400}/i)?.[0] ?? "";
  const num = h2.match(/>\s*([\d\s]{1,3}(?:[\s\u00a0]?\d{3})*(?:[,.]\d+)?)\s*</)?.[1]?.trim() ?? null;
  const pct = h2.match(/([+-]?\d+[,.]?\d*)\s*%/)?.[1] ?? null;
  return { asOf, headline: num, pct };
}

(async () => {
  const refs = {
    yahooGspc: await yahoo("^GSPC"),
    yahooTnx: await yahoo("^TNX"),
    yahooBz: await yahoo("BZ=F"),
    yahooGc: await yahoo("GC=F"),
    goldApi: await fetch("https://api.gold-api.com/price/XAU").then((r) => r.json()),
    fredSp500: await fred("SP500"),
    fredDgs10: await fred("DGS10"),
  };

  const results = [];
  for (const inst of instruments) {
    const [html, hist, ghost] = await Promise.all([
      fetch(inst.page, { headers: { "User-Agent": UA } }).then((r) => r.text()),
      fetchJson(`https://www.di.se/market/instrument-history/${inst.insref}/`),
      fetchJson(`https://www.di.se/stock/ghostgraph/${inst.insref}/`),
    ]);

    const page = parseSwedishHeadline(html);
    const histLast = lastPoint(hist.json?.points);
    const histRecent = firstRecent(hist.json?.points, 7);
    const ghostArr = Array.isArray(ghost.json) ? ghost.json : [];
    const ghostPoints = ghostArr[0]?.points;
    const ghostLast = lastPoint(ghostPoints);
    const ghostRecent = firstRecent(ghostPoints, 1);

    results.push({
      ...inst,
      page,
      endpoints: {
        history: {
          url: `https://www.di.se/market/instrument-history/${inst.insref}/`,
          status: hist.status,
          ct: hist.ct,
          name: hist.json?.name,
          last: histLast,
          recent7d: histRecent,
        },
        ghostgraph: {
          url: `https://www.di.se/stock/ghostgraph/${inst.insref}/`,
          status: ghost.status,
          ct: ghost.ct,
          name: ghostArr[0]?.name,
          last: ghostLast,
          recent1d: ghostRecent,
        },
      },
      noAuthNoCookies: hist.status === 200 && ghost.status === 200,
    });
  }

  console.log(JSON.stringify({ probedAt: new Date().toISOString(), refs, results }, null, 2));
})();
