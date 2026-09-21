/**
 * Tests for vol-index quote parsing (VIX TradingView + VSTOXX cash-index adapter).
 * Run: npm run test:vol-indices
 */

import { formatOrdinal, formatSignedPct, formatVolIndex, formatVvixVixRatio } from "../src/lib/derivatives/format.ts";
import { isIndexQuote, parseTvSymbolQuote } from "../src/lib/derivatives/tradingviewQuote.ts";
import { VOL_INDICES } from "../src/lib/derivatives/volIndices.ts";
import {
  classifySkewTailRisk,
  parseCboeSkewHistory,
  resolveSkewIndex,
  skewOneYearPercentile,
} from "../src/lib/derivatives/skewIndex.ts";
import {
  isCashVstoxxIndex,
  latestTwoV2txCloses,
  parseMarketsInsiderVstoxxHtml,
  parseStoxxV2txHistory,
  resolveVstoxxQuote,
  vstoxxPriorSessionClose,
} from "../src/lib/derivatives/vstoxxQuote.ts";
import { calculatePercentile, dedupeDatedCloses, percentileFromDatedCloses } from "../src/lib/derivatives/percentile.ts";
import { parseCboeVolHistory } from "../src/lib/derivatives/volTermStructure.ts";
import { loadVixEodPercentile, VIX_CBOE_HISTORY_URL } from "../src/lib/derivatives/vixEodPercentile.ts";
import {
  resolveVvixIndex,
  resolveVvixVixRatio,
  VVIX_CBOE_HISTORY_URL,
  vvixChangePct,
  vvixVixRatioSeries,
} from "../src/lib/derivatives/vvixIndex.ts";
import {
  buildEquityVolDayMove,
  buildSpxVixDayMove,
  vixImpliedDailyOneSigmaPct,
} from "../src/lib/derivatives/vixSpxDayMove.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

{
  const q = parseTvSymbolQuote("CBOE:VIX", {
    change: 1.5533980582524287,
    close: 15.69,
    description: "CBOE Volatility Index",
    exchange: "CBOE",
    name: "VIX",
    type: "index",
    update_mode: "delayed_streaming_900",
  });
  assert(q != null, "parse VIX");
  assert(q!.close === 15.69, `VIX close ${q!.close}`);
  assert(q!.changePct != null && Math.abs(q!.changePct - 1.5533980582524287) < 1e-12, "VIX change");
  assert(q!.prevClose == null, "no prev close without change_abs");
  assert(isIndexQuote(q!), "VIX is index");
}

{
  assert(parseTvSymbolQuote("STOXX:V2TX", { code: "symbol_not_exists", errmsg: "empty response" }) === null, "missing symbol");
  assert(parseTvSymbolQuote("CBOE:VIX", { description: "CBOE Volatility Index" }) === null, "no close");
}

{
  const futures = parseTvSymbolQuote("EUREX:FVS1!", {
    change: -0.29,
    close: 17.3,
    description: "FVS-VSTOXX Futures",
    exchange: "EUREX",
    name: "FVS1!",
    type: "futures",
    update_mode: "delayed_streaming_900",
  });
  assert(futures != null, "parse futures");
  assert(!isIndexQuote(futures!), "VSTOXX futures must not be treated as the VSTOXX index");
}

{
  const vstoxx = VOL_INDICES.find((d) => d.id === "vstoxx");
  assert(vstoxx != null, "VSTOXX def");
  assert(vstoxx!.tvTickers.length === 0, "VSTOXX cash index does not use TradingView tickers");
  assert(!vstoxx!.tvTickers.some((t) => t.includes("FVS")), "do not request VSTOXX futures");
  const vix = VOL_INDICES.find((d) => d.id === "vix");
  assert(vix != null && vix.tvTickers.length === 1 && vix.tvTickers[0] === "CBOE:VIX", "VIX ticker unchanged");
  const vvix = VOL_INDICES.find((d) => d.id === "vvix");
  assert(vvix != null && vvix.tvTickers.length === 0, "VVIX uses Cboe history, not TradingView");
  assert(VOL_INDICES.map((d) => d.id).join(",") === "vix,vvix,vstoxx", "VVIX sits next to VIX");
}

{
  const sample = [
    "Date;Symbol;Indexvalue",
    "25.08.2026;V2TX;16.0922",
    "26.08.2026;OTHER;99",
    "26.08.2026;V2TX;15.8767",
    "bad",
    "",
  ].join("\n");
  const rows = parseStoxxV2txHistory(sample);
  assert(rows.length === 2, `V2TX rows ${rows.length}`);
  const pair = latestTwoV2txCloses(rows);
  assert(pair != null && pair.latest.close === 15.8767, "latest official EOD");
  assert(pair!.prior != null && pair!.prior.close === 16.0922, "prior official EOD");
}

{
  const html = `
    window.priceSections.configs.push({
      priceSection: {"label":"VSTOXX Volatilitätsindex","instrumentId":55653,"category":"Index","currentValue":16.33,"previousClose":15.8767,"isFuture":false}
    });
    window.priceSections.configs.push({ priceSection: null });
  `;
  const mi = parseMarketsInsiderVstoxxHtml(html);
  assert(mi != null && mi.last === 16.33, "MI cash last");
  assert(mi!.previousClose === 15.8767, "MI previous close");
  assert(isCashVstoxxIndex(mi!), "MI is cash VSTOXX index");
}

{
  const futuresHtml = `priceSection: {"label":"FVS-VSTOXX Futures","category":"Future","currentValue":17.35,"previousClose":17.3,"isFuture":true}`;
  assert(parseMarketsInsiderVstoxxHtml(futuresHtml) === null, "reject FVS futures");
  const etfHtml = `priceSection: {"label":"VSTOXX ETF","category":"Index","currentValue":16.1,"previousClose":15.9,"isFuture":false}`;
  assert(parseMarketsInsiderVstoxxHtml(etfHtml) === null, "reject VSTOXX ETF");
}

{
  const eod = {
    latest: { date: "2026-08-26", close: 15.8767 },
    prior: { date: "2026-08-25", close: 16.0922 },
  };
  const live = resolveVstoxxQuote(eod, {
    last: 16.33,
    previousClose: 15.8767,
    label: "VSTOXX Volatilitätsindex",
    category: "Index",
    isFuture: false,
  });
  assert(live != null && live.kind === "intraday", "intraday path");
  assert(live!.prevCloseCrossCheck === "passed", "prev-close cross-check passed");
  assert(Math.abs(live!.changePct - ((16.33 - 15.8767) / 15.8767) * 100) < 1e-12, "change vs official EOD");
  assert(live!.lastSource.includes("Markets Insider"), "last from MI");
  assert(live!.prevCloseSource.includes("STOXX"), "prev close from STOXX");

  const skipped = resolveVstoxxQuote(eod, {
    last: 16.33,
    previousClose: null,
    label: "VSTOXX",
    category: "Index",
    isFuture: false,
  });
  assert(skipped != null && skipped.kind === "intraday" && skipped.prevCloseCrossCheck === "skipped", "no vendor prev close");

  const disagreed = resolveVstoxxQuote(eod, {
    last: 16.33,
    previousClose: 17.35,
    label: "VSTOXX",
    category: "Index",
    isFuture: false,
  });
  assert(disagreed != null && disagreed.kind === "eod", "reject mismatched prev close");
  assert(disagreed!.last === 15.8767, "EOD last after reject");
  assert(disagreed!.prevCloseCrossCheck === "failed", "cross-check failed recorded");
  assert(Math.abs(disagreed!.changePct - ((15.8767 - 16.0922) / 16.0922) * 100) < 1e-12, "EOD change vs prior");

  const fallback = resolveVstoxxQuote(eod, null);
  assert(fallback != null && fallback.kind === "eod", "EOD fallback");
  assert(fallback!.lastSource.includes("previous session"), "EOD marked previous session");
  assert(fallback!.prevCloseCrossCheck === "not_applicable", "no intraday to check");

  const miOnly = resolveVstoxxQuote(null, {
    last: 16.33,
    previousClose: 15.8767,
    label: "VSTOXX",
    category: "Index",
    isFuture: false,
  });
  assert(miOnly != null && miOnly.kind === "intraday", "MI-only when official EOD missing");
  assert(miOnly!.prevCloseCrossCheck === "skipped", "cannot cross-check without official EOD");
  assert(resolveVstoxxQuote(null, {
    last: 17.35,
    previousClose: 17.3,
    label: "FVS-VSTOXX Futures",
    category: "Future",
    isFuture: true,
  }) === null, "MI-only path still rejects futures");
}

{
  assert(formatVolIndex(15.69) === "15.7", `index format ${formatVolIndex(15.69)}`);
  assert(formatVolIndex(null) === "—", "null index");
  assert(formatSignedPct(1.55) === "+1.6%", `signed pct ${formatSignedPct(1.55)}`);
}

{
  const q = parseTvSymbolQuote("CBOE:VIX", {
    change: -1.3149243918474758,
    change_abs: -0.20000000000000107,
    close: 15.01,
    type: "index",
  });
  assert(q != null, "parse VIX with change_abs");
  assert(q!.prevClose != null && Math.abs(q!.prevClose - 15.21) < 1e-12, `prevClose ${q!.prevClose}`);
}

{
  const daily = vixImpliedDailyOneSigmaPct(14.92);
  assert(daily != null, "daily sigma");
  assert(Math.abs(daily! - 14.92 / Math.sqrt(252)) < 1e-12, `daily ${daily}`);
  const built = buildSpxVixDayMove(
    {
      symbol: "CBOE:VIX",
      name: "VIX",
      description: null,
      close: 15.69,
      changePct: null,
      changeAbs: null,
      prevClose: 14.92,
      exchange: "CBOE",
      type: "index",
      updateMode: null,
    },
    {
      symbol: "SP:SPX",
      name: "SPX",
      description: null,
      close: 99.58,
      changePct: null,
      changeAbs: null,
      prevClose: 100,
      exchange: "SP",
      type: "index",
      updateMode: null,
    },
  );
  assert(built != null, "build day move");
  assert(Math.abs(built!.spxChangePct - -0.42) < 1e-12, `spx pct ${built!.spxChangePct}`);
  assert(built!.vixLast === 15.69, "current VIX is stored but not used for daily 1σ");
  assert(built!.vixPrevClose === 14.92, "prior VIX close");
  assert(Math.abs(built!.dailyImpliedSigmaPct - daily!) < 1e-12, "daily from prior close");
}

{
  const live = resolveVstoxxQuote(
    { latest: { date: "2026-08-26", close: 15.8767 }, prior: { date: "2026-08-25", close: 16.0922 } },
    {
      last: 16.33,
      previousClose: 15.8767,
      label: "VSTOXX",
      category: "Index",
      isFuture: false,
    },
  );
  assert(live != null, "live vstoxx for prior-session helper");
  assert(vstoxxPriorSessionClose(live!, "2026-08-27") === 15.8767, "prior session is latest EOD before today");
  assert(vstoxxPriorSessionClose(live!, "2026-08-26") === 16.0922, "if EOD file already has today, use prior row");

  const sx5eMove = buildEquityVolDayMove({
    volLast: 16.33,
    volPrevClose: 15.8767,
    equityLast: 5540,
    equityPrevClose: 5500,
    equitySourceLabel: "TradingView STOXX:SX5E",
    volSourceLabel: "STOXX V2TX",
  });
  assert(sx5eMove != null, "SX5E / VSTOXX day move");
  const expectedDaily = 15.8767 / Math.sqrt(252);
  assert(Math.abs(sx5eMove!.dailyImpliedSigmaPct - expectedDaily) < 1e-12, "daily 1σ from prior VSTOXX");
  assert(Math.abs(sx5eMove!.spxChangePct - ((5540 - 5500) / 5500) * 100) < 1e-12, "SX5E pct");
}

{
  assert(VOL_INDICES.length === 3 && VOL_INDICES[0]!.id === "vix" && VOL_INDICES[1]!.id === "vvix" && VOL_INDICES[2]!.id === "vstoxx", "SKEW is not a VIX/VVIX/VSTOXX vol-index id");
  const csv = ["DATE,SKEW", "08/25/2026,143.270000", "08/26/2026,142.960000"].join("\n");
  const hist = parseCboeSkewHistory(csv);
  assert(hist.length === 2 && hist[1]!.close === 142.96, "parse CBOE SKEW CSV");
  const resolved = resolveSkewIndex(hist);
  assert(resolved != null && resolved.last === 142.96, "SKEW last");
  assert(resolved!.changePct != null && Math.abs(resolved!.changePct - ((142.96 - 143.27) / 143.27) * 100) < 1e-12, "SKEW change");
  const values = [120, 130, 140, 145, 150];
  const pct = skewOneYearPercentile(145, values);
  assert(pct != null && Math.abs(pct - 80) < 1e-12, `percentile ${pct}`);
  assert(classifySkewTailRisk(0) === "Low", "0 Low");
  assert(classifySkewTailRisk(25) === "Low", "25 Low");
  assert(classifySkewTailRisk(25.01) === "Normal", ">25 Normal");
  assert(classifySkewTailRisk(75) === "Normal", "75 Normal");
  assert(classifySkewTailRisk(75.01) === "Elevated", ">75 Elevated");
  assert(classifySkewTailRisk(90) === "Elevated", "90 Elevated");
  assert(classifySkewTailRisk(90.01) === "High", ">90 High");
  assert(formatOrdinal(36.9) === "37th", "37th");
  assert(formatOrdinal(1) === "1st", "1st");
  assert(formatOrdinal(22) === "22nd", "22nd");
  assert(formatOrdinal(3) === "3rd", "3rd");
  assert(formatOrdinal(11) === "11th", "11th");
}

{
  const csv = ["DATE,VVIX", "09/02/2026,86.250000", "09/03/2026,83.800000"].join("\n");
  const parsed = parseCboeVolHistory(csv);
  assert(parsed.length === 2 && parsed[1]!.close === 83.8, "parse CBOE VVIX CSV");
  const resolved = resolveVvixIndex(csv);
  assert(resolved != null && resolved.last === 83.8 && resolved.asOf === "2026-09-03", "VVIX last");
  const expectedChg = vvixChangePct(83.8, 86.25);
  assert(resolved!.changePct != null && expectedChg != null && Math.abs(resolved!.changePct - expectedChg) < 1e-12, "VVIX 1D change");
  assert(resolved!.percentile1y == null, "VVIX percentile needs 200 observations");
  const rows = Array.from({ length: 252 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, 1 + i));
    const date = d.toISOString().slice(0, 10);
    const close = 70 + (i === 251 ? 30 : i % 40);
    return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)},${close.toFixed(2)}`;
  });
  const longCsv = ["DATE,VVIX", ...rows].join("\n");
  const longResolved = resolveVvixIndex(longCsv);
  assert(longResolved != null && longResolved.percentileObservationCount === 252, "VVIX 252 window");
  const hist = parseCboeVolHistory(longCsv);
  const manual = percentileFromDatedCloses(hist, 252, 200);
  assert(manual != null && Math.abs(manual.percentile - longResolved!.percentile1y!) < 1e-12, "VVIX percentile matches VIX helper");
}

{
  assert(formatVvixVixRatio(6.84) === "6.8x", "ratio 6.8x");
  assert(formatVvixVixRatio(null) === "—", "ratio missing");
  const vvix = [
    { date: "2026-09-01", close: 90 },
    { date: "2026-09-02", close: 86.25 },
    { date: "2026-09-03", close: 83.8 },
  ];
  const vix = [
    { date: "2026-09-01", close: 14.0 },
    { date: "2026-09-03", close: 14.32 },
  ];
  const series = vvixVixRatioSeries(vvix, vix);
  assert(series.length === 2, "skip session without both prints");
  assert(series[0]!.date === "2026-09-01" && Math.abs(series[0]!.close - 90 / 14) < 1e-12, "ratio day 1");
  assert(series[1]!.date === "2026-09-03" && Math.abs(series[1]!.close - 83.8 / 14.32) < 1e-12, "ratio last common");
  const resolved = resolveVvixVixRatio(vvix, vix);
  assert(resolved != null && resolved.asOf === "2026-09-03", "ratio as-of is last common session");
  assert(Math.abs(resolved!.ratio - 83.8 / 14.32) < 1e-12, "current ratio");
  assert(resolved!.percentile1y == null, "ratio percentile needs 200 common sessions");

  const dates = Array.from({ length: 252 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, 1 + i));
    return d.toISOString().slice(0, 10);
  });
  const longVvix = dates.map((date, i) => ({ date, close: 80 + (i === 251 ? 20 : 0) }));
  const longVix = dates.map((date) => ({ date, close: 10 }));
  const longRatio = resolveVvixVixRatio(longVvix, longVix);
  assert(longRatio != null && longRatio.observationCount === 252, "ratio 252 window");
  assert(longRatio!.asOf === dates[251], "ratio as-of last date");
  assert(Math.abs(longRatio!.ratio - 10) < 1e-12, "last ratio 100/10");
  const manualRatio = percentileFromDatedCloses(
    dates.map((date, i) => ({ date, close: (80 + (i === 251 ? 20 : 0)) / 10 })),
    252,
    200,
  );
  assert(manualRatio != null && Math.abs(manualRatio.percentile - longRatio!.percentile1y!) < 1e-12, "ratio percentile uses shared helper");
}

{
  const pct = skewOneYearPercentile(145, [120, 130, 140, 145, 150]);
  assert(pct != null && Math.abs(pct - 80) < 1e-12, "shared helper matches SKEW 80th");
  const long = Array.from({ length: 300 }, (_, i) => i);
  const ranked = calculatePercentile(long, 299, 252, 200);
  assert(ranked != null && ranked.observationCount === 252, "SKEW-style 252 window");
  assert(Math.abs(ranked!.percentile - 100) < 1e-12, "max is 100th including current");
}

console.log("test-vol-indices: ok");

{
  try {
    const tls = await import("node:tls");
    if (typeof tls.getCACertificates === "function" && typeof tls.setDefaultCACertificates === "function") {
      tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
    }
  } catch {
    /* ignore */
  }
  const vix = await loadVixEodPercentile();
  assert(vix.percentile1y != null, "live VIX EOD percentile");
  assert(vix.percentileObservationCount === 252, `VIX N ${vix.percentileObservationCount}`);
  assert(vix.percentileAsOf != null && vix.eodClose != null, "VIX EOD as-of");
  console.log(`VIX EOD ${vix.percentileAsOf} close=${vix.eodClose} N=${vix.percentileObservationCount} pct=${vix.percentile1y}`);

  const vstoxxText = await fetch("https://www.stoxx.com/document/Indices/Current/HistoricalData/h_v2tx.txt").then((r) => r.text());
  const vstoxxHist = parseStoxxV2txHistory(vstoxxText);
  const vstoxxRanked = percentileFromDatedCloses(vstoxxHist, 252, 200);
  assert(vstoxxRanked != null, "live VSTOXX EOD percentile");
  const vstoxxWindow = dedupeDatedCloses(vstoxxHist).slice(-252);
  assert(new Set(vstoxxWindow.map((r) => r.date)).size === vstoxxWindow.length, "no duplicate VSTOXX dates");
  assert(vstoxxWindow[vstoxxWindow.length - 1]!.close === vstoxxRanked!.current, "VSTOXX current included once");
  let vstoxxCount = 0;
  for (const row of vstoxxWindow) if (row.close <= vstoxxRanked!.current) vstoxxCount += 1;
  assert(Math.abs((vstoxxCount / vstoxxWindow.length) * 100 - vstoxxRanked!.percentile) < 1e-12, "manual VSTOXX percentile math");
  console.log(`VSTOXX EOD ${vstoxxRanked!.asOf} close=${vstoxxRanked!.current} N=${vstoxxRanked!.observationCount} pct=${vstoxxRanked!.percentile}`);

  const skewText = await fetch("https://cdn.cboe.com/api/global/us_indices/daily_prices/SKEW_History.csv").then((r) => r.text());
  const skewHist = parseCboeSkewHistory(skewText);
  const skewResolved = resolveSkewIndex(skewHist);
  assert(skewResolved?.percentile1y != null, "live SKEW percentile");
  const skewManual = calculatePercentile(skewHist.map((r) => r.close), skewHist[skewHist.length - 1]!.close, 252, 1);
  assert(skewManual != null && Math.abs(skewManual.percentile - skewResolved!.percentile1y!) < 1e-12, "SKEW uses shared helper");
  const skewWindowDates = skewHist.slice(-252).map((r) => r.date);
  assert(new Set(skewWindowDates).size === skewWindowDates.length, "no duplicate SKEW dates");
  assert(skewHist.slice(-252)[251]!.close === skewResolved!.last, "SKEW current included once");
  console.log(`SKEW EOD ${skewResolved!.asOf} last=${skewResolved!.last} N=${skewResolved!.observationCount} pct=${skewResolved!.percentile1y}`);

  const vvixText = await fetch(VVIX_CBOE_HISTORY_URL).then((r) => r.text());
  const vvixResolved = resolveVvixIndex(vvixText);
  assert(vvixResolved != null && vvixResolved.last != null, "live VVIX last");
  assert(vvixResolved!.percentile1y != null, "live VVIX percentile");
  assert(vvixResolved!.percentileObservationCount === 252, `VVIX N ${vvixResolved!.percentileObservationCount}`);
  const vvixHist = dedupeDatedCloses(parseCboeVolHistory(vvixText));
  const vvixManual = percentileFromDatedCloses(vvixHist, 252, 200);
  assert(vvixManual != null && Math.abs(vvixManual.percentile - vvixResolved!.percentile1y!) < 1e-12, "VVIX loader matches VIX percentile helper");
  const vvixPrior = vvixHist[vvixHist.length - 2]!;
  const vvixChg = vvixChangePct(vvixResolved!.last, vvixPrior.close);
  assert(vvixChg != null && Math.abs(vvixChg - (vvixResolved!.changePct ?? NaN)) < 1e-12, "VVIX 1D from prior close");
  console.log(`VVIX EOD ${vvixResolved!.asOf} last=${vvixResolved!.last} chg=${vvixResolved!.changePct} N=${vvixResolved!.percentileObservationCount} pct=${vvixResolved!.percentile1y}`);

  const vixText = await fetch(VIX_CBOE_HISTORY_URL).then((r) => r.text());
  const vixHist = dedupeDatedCloses(parseCboeVolHistory(vixText));
  const ratio = resolveVvixVixRatio(vvixHist, vixHist);
  assert(ratio != null && Number.isFinite(ratio.ratio), "live VVIX/VIX ratio");
  assert(ratio!.asOf != null, "ratio as-of");
  assert(ratio!.percentile1y != null, "live ratio percentile");
  assert(ratio!.observationCount === 252, `ratio N ${ratio!.observationCount}`);
  const ratioManual = percentileFromDatedCloses(vvixVixRatioSeries(vvixHist, vixHist), 252, 200);
  assert(ratioManual != null && Math.abs(ratioManual.percentile - ratio!.percentile1y!) < 1e-12, "ratio percentile matches helper");
  assert(ratio!.asOf === ratioManual!.asOf, "ratio as-of is last common session");
  console.log(`VVIX/VIX ${ratio!.asOf} ratio=${ratio!.ratio.toFixed(2)}x N=${ratio!.observationCount} pct=${ratio!.percentile1y}`);

  const vixManual = percentileFromDatedCloses(vixHist, 252, 200);
  assert(vixManual != null && vix.eodClose === vixManual.current, "VIX percentile from CLOSE");
  assert(Math.abs(vix.percentile1y! - vixManual.percentile) < 1e-12, "VIX loader matches manual");
  const window = vixHist.slice(-252).map((r) => r.close);
  const dates = vixHist.slice(-252).map((r) => r.date);
  assert(new Set(dates).size === dates.length, "no duplicate dates in VIX window");
  assert(window[window.length - 1] === vixManual.current, "current is last of window");
  let count = 0;
  for (const v of window) if (v <= vixManual.current) count += 1;
  assert(Math.abs((count / window.length) * 100 - vixManual.percentile) < 1e-12, "manual VIX percentile math");
}

console.log("vol-index percentile live: ok");
