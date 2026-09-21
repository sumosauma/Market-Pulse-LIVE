import { exchangeTzFromRow, fmtExchangeTime } from "../src/lib/equities/equityExchangeTz";
import { intradayLastSession } from "../src/lib/equities/equityIntradaySession";

const UA = "Mozilla/5.0 (compatible; MarketPulse-probe/1.0)";

async function avanzaIntraday(id: string) {
  const url = `https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=today&resolution=five_minutes`;
  const j = (await (
    await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
  ).json()) as { ohlc?: { timestamp: number; close: number }[] };
  const points = [];
  for (const bar of j.ohlc ?? []) {
    if (typeof bar.timestamp === "number" && typeof bar.close === "number") {
      points.push({ date: new Date(bar.timestamp).toISOString(), price: bar.close });
    }
  }
  return points;
}

for (const [name, id, ticker] of [
  ["OMXC25", "731293", "^OMXC25"],
  ["NQZA", "134950", "^NQZA"],
] as const) {
  const points = await avanzaIntraday(id);
  const tz = exchangeTzFromRow({ ticker, exchangeTimezoneName: null, gmtoffset: null, timezone: null });
  const sess = intradayLastSession(points, tz);
  console.log(name, "raw", points.length, "session", sess.length);
  if (sess.length) {
    console.log(
      " first",
      fmtExchangeTime(sess[0]!.date, tz),
      "last",
      fmtExchangeTime(sess[sess.length - 1]!.date, tz),
    );
  }
}
