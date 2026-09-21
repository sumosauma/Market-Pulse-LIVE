/**
 * Tests for implied-vol term structure (Cboe VIX family + STOXX VSTOXX main indices).
 * Run: npm run test:vol-term-structure
 */

import {
  calendarDaysBetween,
  classifyVolTermShape,
  commonDateSpreads,
  displayVolTermShape,
  findLatestCommonDate,
  historyToDateMap,
  parseCboeVolHistory,
  parseStoxxVolHistory,
  resolveSpx1m3mSpread,
  resolveTermSpread,
  resolveVolTermStructure,
  VOL_TERM_SERIES,
  type VolTermSeriesDef,
  type VolTermSeriesHistory,
} from "../src/lib/derivatives/volTermStructure.ts";
import { calculatePercentile } from "../src/lib/derivatives/percentile.ts";
import { loadVolTermStructure } from "../src/lib/derivatives/volTermStructureSource.ts";
import { fetchOfficialText } from "../src/lib/derivatives/officialFetch.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function defByTicker(ticker: string): VolTermSeriesDef {
  const def = VOL_TERM_SERIES.find((s) => s.ticker === ticker);
  if (!def) throw new Error(`missing series ${ticker}`);
  return def;
}

function hist(ticker: string, rows: { date: string; close: number }[]): VolTermSeriesHistory {
  return { def: defByTicker(ticker), rows };
}

{
  const csv = `DATE,OPEN,HIGH,LOW,CLOSE
08/25/2026,15.10,15.40,14.90,15.20
08/26/2026,15.20,15.50,15.00,15.21
08/27/2026,14.80,15.00,14.40,14.54
`;
  const rows = parseCboeVolHistory(csv);
  assert(rows.length === 3, `cboe rows ${rows.length}`);
  assert(rows[1]!.date === "2026-08-26" && rows[1]!.close === 15.21, "cboe close column");
  assert(rows[2]!.date === "2026-08-27" && rows[2]!.close === 14.54, "cboe last row");
}

{
  const txt = `Date;Symbol;Indexvalue
25.08.2026;VSTX90;18.2726
26.08.2026;VSTX90;18.0802
26.08.2026;V6I3;17.9410
`;
  const rows = parseStoxxVolHistory(txt, "VSTX90");
  assert(rows.length === 2, `stoxx rows ${rows.length}`);
  assert(rows[1]!.date === "2026-08-26" && rows[1]!.close === 18.0802, "stoxx main index");
  assert(parseStoxxVolHistory(txt, "V6I3").length === 0, "reject VSTOXX sub-index ticker request");
  assert(
    parseStoxxVolHistory("26.08.2026;V6I1;15.2556\n", "V2TX").length === 0,
    "V6I1 must not parse as V2TX",
  );
}

{
  assert(classifyVolTermShape(15.2, 22.4) === "Contango", "contango / upward");
  assert(classifyVolTermShape(22.4, 15.2) === "Backwardation", "backwardation / downward");
  assert(classifyVolTermShape(18.0, 18.4) === "Flat", "flat under 0.5");
  assert(classifyVolTermShape(18.0, 18.5) === "Flat", "flat at 0.5");
  assert(classifyVolTermShape(18.0, 18.51) === "Contango", "contango just over 0.5");
  assert(displayVolTermShape("Upward") === "Contango", "cached upward → contango");
  assert(displayVolTermShape("Inverted") === "Backwardation", "cached inverted → backwardation");
  assert(displayVolTermShape("Contango") === "Contango", "live contango");
  assert(displayVolTermShape(null) === "—", "missing shape");
}

{
  const maps = [
    historyToDateMap([
      { date: "2026-08-26", close: 15.21 },
      { date: "2026-08-27", close: 14.54 },
    ]),
    historyToDateMap([{ date: "2026-08-26", close: 17.99 }]),
  ];
  assert(findLatestCommonDate(maps) === "2026-08-26", "common date ignores later incomplete session");
}

{
  const tickers = ["VIX", "VIX3M", "VIX6M", "VIX1Y", "V2TX", "VSTX90", "VSTX180", "VSTX360"] as const;
  const histories = tickers.map((ticker, i) =>
    hist(ticker, [
      { date: "2026-08-25", close: 10 + i },
      { date: "2026-08-26", close: 20 + i },
      ...(ticker === "VIX" ? [{ date: "2026-08-27", close: 99 }] : []),
    ]),
  );
  const resolved = resolveVolTermStructure(histories, "2026-08-27");
  assert(resolved.unavailableReason == null, resolved.unavailableReason ?? "expected success");
  assert(resolved.asOf === "2026-08-26", `asOf ${resolved.asOf}`);
  assert(resolved.spx?.points[0]!.value === 20, "SPX 1M uses common date, not later VIX print");
  assert(resolved.spx?.points[0]!.ticker === "VIX", "SPX 1M ticker");
  assert(resolved.spx?.points[1]!.ticker === "VIX3M", "SPX 3M ticker");
  assert(resolved.spx?.points[2]!.ticker === "VIX6M", "SPX 6M ticker");
  assert(resolved.spx?.points[3]!.ticker === "VIX1Y", "SPX 1Y ticker");
  assert(resolved.sx5e?.points[0]!.ticker === "V2TX", "EU 1M ticker");
  assert(resolved.sx5e?.points[1]!.ticker === "VSTX90", "EU 3M ticker");
  assert(resolved.sx5e?.points[2]!.ticker === "VSTX180", "EU 6M ticker");
  assert(resolved.sx5e?.points[3]!.ticker === "VSTX360", "EU 1Y ticker");
  assert(resolved.spx?.shape === "Contango", "sample SPX shape");
  assert(resolved.sx5e?.shape === "Contango", "sample EU shape");
  assert(resolved.spxSpread1m3m != null, "1M-3M spread on common date");
  assert(resolved.spxSpread1m3m!.asOf === "2026-08-26", "spread uses chart as-of");
  assert(Math.abs(resolved.spxSpread1m3m!.value - (20 - 21)) < 1e-12, "spread is VIX-VIX3M on 26th not 99-21");
  assert(resolved.spxSpread1m3m!.percentile1y == null, "too few common dates for 1Y percentile");
  assert(resolved.spxSpread1m1y != null, "SPX 1M-1Y");
  assert(Math.abs(resolved.spxSpread1m1y!.value - (20 - 23)) < 1e-12, "VIX-VIX1Y on 26th");
  assert(resolved.sx5eSpread1m3m != null, "EU 1M-3M");
  assert(Math.abs(resolved.sx5eSpread1m3m!.value - (24 - 25)) < 1e-12, "V2TX-VSTX90 on 26th");
  assert(resolved.sx5eSpread1m1y != null, "EU 1M-1Y");
  assert(Math.abs(resolved.sx5eSpread1m1y!.value - (24 - 27)) < 1e-12, "V2TX-VSTX360 on 26th");
}

{
  const tickers = ["VIX", "VIX3M", "VIX6M", "VIX1Y", "V2TX", "VSTX90", "VSTX180", "VSTX360"] as const;
  const histories = tickers.map((ticker) => hist(ticker, [{ date: "2026-07-01", close: 18 }]));
  const stale = resolveVolTermStructure(histories, "2026-08-27");
  assert(stale.unavailableReason != null, "stale common date is unavailable");
  assert(stale.chartRows == null, "do not render stale mixed curves");
}

{
  const urls = VOL_TERM_SERIES.map((s) => s.sourceUrl).join(" ");
  const files = VOL_TERM_SERIES.map((s) => s.sourceFile).join(" ");
  assert(!/future|vxn|fvs|v6i|tradingview|etf|etn/i.test(urls), "no futures/TV/proxy URLs");
  assert(!/v6i/i.test(files), "no VSTOXX sub-index files");
  assert(VOL_TERM_SERIES.every((s) => s.sourceKind === "cboe-csv" || s.sourceKind === "stoxx-txt"), "official files only");
  assert(calendarDaysBetween("2026-08-26", "2026-08-27") === 1, "lag days");
}

{
  const few = Array.from({ length: 199 }, (_, i) => i + 1);
  assert(calculatePercentile(few, 199, 252, 200) == null, "min 200");
  const values = [...Array(251).fill(100), 10];
  const included = calculatePercentile(values, 10, 252, 200);
  assert(included != null && included.observationCount === 252, "window 252");
  assert(Math.abs(included!.percentile - (1 / 252) * 100) < 1e-12, "current included once");
  const dropOldest = calculatePercentile([1, ...Array(251).fill(100), 10], 10, 252, 200);
  assert(dropOldest != null && Math.abs(dropOldest.percentile - (1 / 252) * 100) < 1e-12, "slice drops oldest");
  const dirty = calculatePercentile([Number.NaN, 8, Number.POSITIVE_INFINITY, 9, 10], 10, 252, 3);
  assert(dirty != null && dirty.observationCount === 3, "drop non-finite");
  assert(Math.abs(dirty!.percentile - 100) < 1e-12, "all three <= 10");
}

{
  const spreads = commonDateSpreads(
    [
      { date: "2026-01-02", close: 15 },
      { date: "2026-01-02", close: 16 },
      { date: "2026-01-03", close: 18 },
      { date: "2026-01-05", close: 20 },
    ],
    [
      { date: "2026-01-02", close: 17 },
      { date: "2026-01-04", close: 19 },
      { date: "2026-01-05", close: 22 },
    ],
  );
  assert(spreads.length === 2, `common dates ${spreads.length}`);
  assert(spreads[0]!.date === "2026-01-02" && spreads[0]!.spread === 16 - 17, "duplicate date last close wins");
  assert(spreads[1]!.date === "2026-01-05" && spreads[1]!.spread === 20 - 22, "skip dates missing either leg");

  const iso = (n: number) => new Date(Date.UTC(2020, 0, 1 + n)).toISOString().slice(0, 10);
  const asOf = iso(251);
  const vix = Array.from({ length: 252 }, (_, i) => ({ date: iso(i), close: i === 251 ? 10 : 15 }));
  const vix3m = Array.from({ length: 252 }, (_, i) => ({ date: iso(i), close: 18 }));
  const ranked = resolveSpx1m3mSpread(vix, vix3m, asOf);
  assert(ranked != null, "252 common dates");
  assert(ranked!.asOf === asOf, "spread as-of");
  assert(Math.abs(ranked!.value - (10 - 18)) < 1e-12, "spread on as-of");
  assert(ranked!.observationCount === 252, "N=252");
  assert(ranked!.percentile1y != null && Math.abs(ranked!.percentile1y - (1 / 252) * 100) < 1e-12, "current spread included once");
  assert(resolveSpx1m3mSpread(vix, [], asOf) == null, "no spread without VIX3M");
}

console.log("unit tests passed");

{
  const live = await loadVolTermStructure();
  if (live.unavailableReason || !live.asOf || !live.spx || !live.sx5e || !live.chartRows) {
    throw new Error(`live load failed: ${live.unavailableReason ?? "missing curves"}`);
  }
  console.log(`common as-of: ${live.asOf}`);
  for (const pt of live.spx.points) {
    console.log(`SPX ${pt.maturity} ${pt.ticker} ${pt.value} ${pt.sourceFile}`);
  }
  for (const pt of live.sx5e.points) {
    console.log(`SX5E ${pt.maturity} ${pt.ticker} ${pt.value} ${pt.sourceFile}`);
  }
  console.log(`SPX curve: ${live.spx.shape}`);
  console.log(`SX5E curve: ${live.sx5e.shape}`);

  const vixCsv = await fetchOfficialText("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", "text/csv,*/*", "https://www.cboe.com/");
  const vix3mCsv = await fetchOfficialText("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv", "text/csv,*/*", "https://www.cboe.com/");
  const vix1yCsv = await fetchOfficialText("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX1Y_History.csv", "text/csv,*/*", "https://www.cboe.com/");
  const v2txText = await fetchOfficialText("https://www.stoxx.com/document/Indices/Current/HistoricalData/h_v2tx.txt", "text/plain,text/csv,*/*", "https://www.stoxx.com/");
  const vstx90Text = await fetchOfficialText("https://www.stoxx.com/document/Indices/Current/HistoricalData/h_vstx90.txt", "text/plain,text/csv,*/*", "https://www.stoxx.com/");
  const vstx360Text = await fetchOfficialText("https://www.stoxx.com/document/Indices/Current/HistoricalData/h_vstx360.txt", "text/plain,text/csv,*/*", "https://www.stoxx.com/");
  assert(vixCsv && vix3mCsv && vix1yCsv && v2txText && vstx90Text && vstx360Text, "independent histories");
  const vixRows = parseCboeVolHistory(vixCsv);
  const vix3mRows = parseCboeVolHistory(vix3mCsv);
  const vix1yRows = parseCboeVolHistory(vix1yCsv);
  const v2txRows = parseStoxxVolHistory(v2txText, "V2TX");
  const vstx90Rows = parseStoxxVolHistory(vstx90Text, "VSTX90");
  const vstx360Rows = parseStoxxVolHistory(vstx360Text, "VSTX360");

  const checks = [
    { name: "SPX 1M-3M", payload: live.spxSpread1m3m, left: vixRows, right: vix3mRows, leftPt: live.spx.points.find((p) => p.maturity === "1M")!, rightPt: live.spx.points.find((p) => p.maturity === "3M")! },
    { name: "SPX 1M-1Y", payload: live.spxSpread1m1y, left: vixRows, right: vix1yRows, leftPt: live.spx.points.find((p) => p.maturity === "1M")!, rightPt: live.spx.points.find((p) => p.maturity === "1Y")! },
    { name: "SX5E 1M-3M", payload: live.sx5eSpread1m3m, left: v2txRows, right: vstx90Rows, leftPt: live.sx5e.points.find((p) => p.maturity === "1M")!, rightPt: live.sx5e.points.find((p) => p.maturity === "3M")! },
    { name: "SX5E 1M-1Y", payload: live.sx5eSpread1m1y, left: v2txRows, right: vstx360Rows, leftPt: live.sx5e.points.find((p) => p.maturity === "1M")!, rightPt: live.sx5e.points.find((p) => p.maturity === "1Y")! },
  ] as const;

  for (const check of checks) {
    const spread = check.payload;
    assert(spread != null, `${check.name} missing`);
    assert(spread!.asOf === live.asOf, `${check.name} as-of`);
    assert(Math.abs(spread!.value - (check.leftPt.value - check.rightPt.value)) < 1e-12, `${check.name} matches chart points`);
    const manual = resolveTermSpread(check.left, check.right, live.asOf, spread!.label);
    assert(manual != null, `${check.name} independent parse`);
    assert(Math.abs(manual!.value - spread!.value) < 1e-12, `${check.name} value matches independent parse`);
    assert(manual!.percentile1y != null && spread!.percentile1y != null, `${check.name} percentile`);
    assert(Math.abs(manual!.percentile1y - spread!.percentile1y) < 1e-12, `${check.name} percentile matches`);
    const series = commonDateSpreads(check.left, check.right).filter((r) => r.date <= live.asOf);
    const window = series.slice(-252);
    assert(window.length >= 200, `${check.name} window >= 200`);
    assert(window.length <= 252, `${check.name} window <= 252`);
    assert(window[window.length - 1]!.date === live.asOf, `${check.name} current included last`);
    assert(new Set(window.map((r) => r.date)).size === window.length, `${check.name} no duplicate dates`);
    assert(window.every((r) => Number.isFinite(r.spread)), `${check.name} no nulls`);
    let n = 0;
    for (const row of window) if (row.spread <= spread!.value) n += 1;
    assert(Math.abs((n / window.length) * 100 - spread!.percentile1y) < 1e-12, `${check.name} manual percentile math`);
    console.log(
      `${check.name} asOf=${spread!.asOf} ${check.leftPt.ticker}=${check.leftPt.value} ${check.rightPt.ticker}=${check.rightPt.value} spread=${spread!.value} N=${spread!.observationCount} pct=${spread!.percentile1y}`,
    );
  }

  const prior1m3m = resolveSpx1m3mSpread(vixRows, vix3mRows, live.asOf);
  assert(prior1m3m != null && live.spxSpread1m3m != null, "existing 1M-3M still resolves");
  assert(Math.abs(prior1m3m!.value - live.spxSpread1m3m!.value) < 1e-12, "existing SPX 1M-3M value unchanged");
  assert(
    prior1m3m!.percentile1y != null &&
      live.spxSpread1m3m!.percentile1y != null &&
      Math.abs(prior1m3m!.percentile1y - live.spxSpread1m3m!.percentile1y) < 1e-12,
    "existing SPX 1M-3M percentile unchanged",
  );

  assert(live.spx.points.every((p) => p.sourceFile.endsWith(".csv")), "SPX from Cboe CSV");
  assert(live.sx5e.points.every((p) => p.sourceFile.endsWith(".txt")), "EU from STOXX txt");
  assert(!live.sx5e.points.some((p) => /^V6I/i.test(p.ticker)), "no sub-indices");
  assert(live.chartRows.every((r) => Number.isFinite(r.spx) && Number.isFinite(r.sx5e)), "all eight points");
}

console.log("vol term structure tests passed");
