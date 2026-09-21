import { change1dPercentFromDailyHistory, changeOverTradingDays } from "../src/lib/equities/equityDayChange";

const res = await (
  await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent("^MXX")}?interval=1d&range=1y`,
  )
).json();
const daily = res.chart.result[0];
const meta = daily.meta;
const ts = daily.timestamp ?? [];
const closes = daily.indicators.quote[0].close ?? [];
const history: { date: string; price: number }[] = [];
for (let i = 0; i < ts.length; i++) {
  if (typeof closes[i] === "number") {
    history.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), price: closes[i]! });
  }
}
const price = meta.regularMarketPrice as number;
const row = { price, history };

console.log("Mexico ^MXX");
console.log("history len", history.length);
console.log("price", price);
console.log("1D %", change1dPercentFromDailyHistory(history, price));
console.log("5D %", changeOverTradingDays(row, 5));
console.log("5D base index", history.length - 6, "base price", history[history.length - 6]?.price);
console.log("last 8 bars:");
for (const h of history.slice(-8)) console.log(" ", h.date, h.price.toFixed(2));

// Compare US
const res2 = await (
  await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent("^GSPC")}?interval=1d&range=1y`,
  )
).json();
const h2 = res2.chart.result[0];
const hist2 = [];
for (let i = 0; i < h2.timestamp.length; i++) {
  const c = h2.indicators.quote[0].close[i];
  if (typeof c === "number") hist2.push({ date: "", price: c });
}
console.log("\nUS 5D %", changeOverTradingDays({ price: h2.meta.regularMarketPrice, history: hist2 }, 5));
