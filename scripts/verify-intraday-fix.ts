import { exchangeTzFromRow, fmtExchangeTime } from "../src/lib/equities/equityExchangeTz";
import { intradayLastSession } from "../src/lib/equities/equityIntradaySession";
import { fetchDenmarkAvanzaIntraday } from "../src/lib/equities/sources/denmarkIntradaySource";
import { fetchNqzaAvanzaIntraday } from "../src/lib/equities/sources/nqzaIntradaySource";

const UA = "Mozilla/5.0 (compatible; MarketPulse-verify/1.0)";

async function yahooIntraday(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=30m&range=5d`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const res = (await r.json()).chart.result[0];
  const points = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const c = res.indicators.quote[0].close[i];
    if (typeof c === "number") points.push({ date: new Date(res.timestamp[i] * 1000).toISOString(), price: c });
  }
  return points;
}

function report(name: string, ticker: string, points: { date: string; price: number }[]) {
  const tz = exchangeTzFromRow({ ticker, exchangeTimezoneName: null, gmtoffset: null, timezone: null });
  const sess = intradayLastSession(points, tz);
  console.log(
    name,
    "bars",
    sess.length,
    sess.length >= 2
      ? `${fmtExchangeTime(sess[0]!.date, tz)} → ${fmtExchangeTime(sess[sess.length - 1]!.date, tz)}`
      : "n/a",
  );
}

const [yahooDk, avanzaDk, yahooZa, avanzaZa] = await Promise.all([
  yahooIntraday("^OMXC25"),
  fetchDenmarkAvanzaIntraday(),
  yahooIntraday("^NQZA"),
  fetchNqzaAvanzaIntraday(),
]);

console.log("Denmark ^OMXC25");
report("  Yahoo before", "^OMXC25", yahooDk);
report("  Avanza after", "^OMXC25", avanzaDk ?? []);

console.log("\nSouth Africa ^NQZA");
report("  Yahoo before", "^NQZA", yahooZa);
report("  Avanza after", "^NQZA", avanzaZa ?? []);
