async function bars(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
  const j = (await (await fetch(url)).json()) as {
    chart: {
      result: Array<{
        timestamp: number[];
        indicators: { quote: Array<{ close: Array<number | null>; volume: Array<number | null> }> };
      }>;
    };
  };
  const r = j.chart.result[0]!;
  const out: Array<{ date: string; close: number; volume: number | null }> = [];
  for (let i = 0; i < (r.timestamp || []).length; i++) {
    const c = r.indicators.quote[0]!.close[i];
    const v = r.indicators.quote[0]!.volume[i];
    if (typeof c === "number" && c > 0) {
      out.push({
        date: new Date(r.timestamp[i]! * 1000).toISOString().slice(0, 10),
        close: c,
        volume: typeof v === "number" ? v : null,
      });
    }
  }
  return out;
}

function pick(series: Awaited<ReturnType<typeof bars>>, d: string) {
  return series.find((b) => b.date === d);
}

const asOf = "2026-11-23";
const prior = "2026-10-23";
const pairs: Array<[string, string, number]> = [
  ["Silver front", "SIZ26.CMX", -0.19970716441691994],
  ["Silver 6M", "SIK27.CMX", -0.19973143656862347],
  ["Brent front", "BZF27.NYM", -0.19991042803704895],
  ["Brent 6M", "BZK27.NYM", -0.17273279542844444],
];

let ok = true;
for (const [label, sym, expected] of pairs) {
  const s = await bars(sym);
  const a = pick(s, asOf);
  const p = pick(s, prior);
  const ret = a && p ? a.close / p.close - 1 : null;
  const match = ret != null && Math.abs(ret - expected) < 1e-9;
  if (!match) ok = false;
  console.log({
    label,
    sym,
    asOfPx: a?.close,
    asOfVol: a?.volume,
    priorPx: p?.close,
    priorVol: p?.volume,
    ret,
    expected,
    match,
  });
}
process.exit(ok ? 0 : 1);
