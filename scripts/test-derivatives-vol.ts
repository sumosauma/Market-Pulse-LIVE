/**
 * Pure-function tests for the Derivatives RV20 / IV20 / VRP foundation.
 * Run: npm run test:derivatives-vol
 */

import { weekdayCountExclusiveStart, thirdFridayUtc } from "../src/lib/derivatives/dates.ts";
import { black76Price, impliedVolBlack76 } from "../src/lib/derivatives/black76.ts";
import {
  nasdaqPretradeAsOf,
  parseOmxs30FutureName,
  parseOmxs30OptionName,
  selectNasdaqPretradeFiles,
  utcYearMonthDay,
} from "../src/lib/derivatives/nasdaqNordicOptions.ts";
import { nordnetExpireIso, nordnetPairToListedQuotes } from "../src/lib/derivatives/nordnetOmxs30Options.ts";
import { formatVolPct, formatVrp } from "../src/lib/derivatives/format.ts";
import {
  atmIvByExpiry,
  interpolateIv20,
  isPlausibleIvDecimal,
  iv20FromCboeChain,
} from "../src/lib/derivatives/impliedVol.ts";
import { iv20FromListedOptions, type ListedOptionQuote } from "../src/lib/derivatives/listedOptionsIv.ts";
import { parseOccOptionSymbol } from "../src/lib/derivatives/occ.ts";
import {
  annualizeDailyVol,
  computeRv20,
  computeVrp,
  logReturns,
  rollingRv20Series,
  rv20Percentile1y,
  sampleStdev,
} from "../src/lib/derivatives/realizedVol.ts";
import { calculatePercentile } from "../src/lib/derivatives/percentile.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, eps: number, message: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > eps) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function pricesFromReturns(start: number, returns: readonly number[]): number[] {
  const closes = [start];
  for (const r of returns) {
    closes.push(closes[closes.length - 1]! * Math.exp(r));
  }
  return closes;
}

// --- OCC ---
{
  const spx = parseOccOptionSymbol("SPX260923C07675000");
  assert(spx?.root === "SPX", "SPX root");
  assert(spx?.expiry === "2026-09-23", `SPX expiry ${spx?.expiry}`);
  assert(spx?.type === "C", "SPX call");
  assert(spx?.strike === 7675, `SPX strike ${spx?.strike}`);

  const spxw = parseOccOptionSymbol("SPXW260923P07680000");
  assert(spxw?.root === "SPXW", "SPXW root");
  assert(spxw?.type === "P", "SPXW put");
  assert(spxw?.strike === 7680, `SPXW strike ${spxw?.strike}`);
  assert(parseOccOptionSymbol("not-an-option") === null, "invalid OCC");
}

// --- weekday DTE ---
{
  const tdte = weekdayCountExclusiveStart("2026-08-26", "2026-09-23");
  assert(tdte === 20, `expected 20 weekdays to 2026-09-23, got ${tdte}`);
  assert(weekdayCountExclusiveStart("2026-08-26", "2026-08-26") === 0, "same day DTE");
}

// --- RV20 ---
{
  const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
  const closes = pricesFromReturns(100, alternating);
  assert(closes.length === 21, "21 closes for 20 returns");
  const rets = logReturns(closes);
  assert(rets.length === 20, `20 log returns, got ${rets.length}`);
  const sd = sampleStdev(rets);
  assert(sd != null, "stdev");
  const expectedSd = 0.01 * Math.sqrt(20 / 19);
  assertClose(sd!, expectedSd, 1e-12, "alternating-return sample stdev (n − 1)");
  assertClose(annualizeDailyVol(sd!), expectedSd * Math.sqrt(252) * 100, 1e-10, "√252 annualization");

  const points = closes.map((close, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, close }));
  const rv = computeRv20(points);
  assert(rv != null, "RV20 computed");
  assertClose(rv!.rv20, annualizeDailyVol(expectedSd), 1e-8, "RV20 from daily closes");
  assert(rv!.asOf === "2026-07-21", `RV20 asOf ${rv!.asOf}`);
}

{
  const flat = Array.from({ length: 21 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: 4000 }));
  const rv = computeRv20(flat);
  assert(rv != null, "flat RV20");
  assertClose(rv!.rv20, 0, 1e-12, "zero realized vol when prices are unchanged");
}

{
  const tooShort = Array.from({ length: 20 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: 100 + i }));
  assert(computeRv20(tooShort) === null, "RV20 needs 21 closes");
}

// --- Rolling RV20 + 1Y percentile ---
{
  const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
  const closes = pricesFromReturns(100, alternating);
  const points = closes.map((close, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, close }));
  const rv = computeRv20(points);
  const series = rollingRv20Series(points);
  assert(series.length === 1, `one RV20 from 21 closes, got ${series.length}`);
  assert(rv != null && series[0]!.rv20 === rv.rv20 && series[0]!.date === rv.asOf, "latest rolling RV20 matches computeRv20");
}

{
  const nCloses = 272;
  const points = Array.from({ length: nCloses }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(4, "0")}`,
    close: 100 * Math.exp(0.0004 * i + ((i % 7) - 3) * 0.002),
  }));
  const rv = computeRv20(points)!;
  const series = rollingRv20Series(points);
  assert(series.length === nCloses - 20, `272 closes → 252 RV20 observations, got ${series.length}`);
  assert(series[series.length - 1]!.rv20 === rv.rv20, "latest historical RV20 matches dashboard computeRv20");
  assert(series[series.length - 1]!.date === rv.asOf, "latest RV20 as-of matches dashboard");
  const last21 = computeRv20(points.slice(-21))!;
  assert(last21.rv20 === rv.rv20, "extra history does not change current RV20");

  const ranked = rv20Percentile1y(series);
  assert(ranked != null, "1Y percentile with 252 observations");
  assert(ranked!.observationCount === 252, `observation count ${ranked!.observationCount}`);
  const expected = calculatePercentile(
    series.map((p) => p.rv20),
    series[series.length - 1]!.rv20,
  )!;
  assert(ranked!.percentile === expected.percentile, "uses shared percentile helper including today");
}

{
  const values = Array.from({ length: 252 }, (_, i) => ({ date: `d${i}`, rv20: i + 1 }));
  const maxRank = rv20Percentile1y(values)!;
  assert(maxRank.observationCount === 252, "includes today's observation in N");
  assertClose(maxRank.percentile, 100, 1e-12, "latest is max → 100th percentile (today counted)");

  const minLast = [...Array.from({ length: 251 }, (_, i) => ({ date: `d${i}`, rv20: i + 2 })), { date: "today", rv20: 1 }];
  const minRank = rv20Percentile1y(minLast)!;
  assertClose(minRank.percentile, (1 / 252) * 100, 1e-12, "latest is unique min → 1/252");
}

{
  const short = Array.from({ length: 199 }, (_, i) => ({ date: `d${i}`, rv20: 10 }));
  assert(rv20Percentile1y(short) === null, "percentile withheld below 200 observations");
  const minOk = Array.from({ length: 200 }, (_, i) => ({ date: `d${i}`, rv20: i === 199 ? 5 : 10 }));
  const ranked = rv20Percentile1y(minOk)!;
  assert(ranked.observationCount === 200, "200 observations is enough");
  assertClose(ranked.percentile, (1 / 200) * 100, 1e-12, "min-observation window includes today");
}

{
  const withHoles = [
    ...Array.from({ length: 21 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: 100 + i })),
    { date: "2026-01-22", close: Number.NaN },
    { date: "2026-01-23", close: 0 },
    { date: "2026-01-24", close: 122 },
  ];
  const series = rollingRv20Series(withHoles);
  const rv = computeRv20(withHoles)!;
  assert(series.length === 2, `invalid closes skipped (no fill), got ${series.length}`);
  assert(series[series.length - 1]!.rv20 === rv.rv20, "hole-skipped latest RV20 still matches computeRv20");
  assert(series[series.length - 1]!.date === "2026-01-24", "as-of is last valid close, not a filled gap");
}

// --- IV20 interpolation ---
{
  const exact = interpolateIv20([{ expiry: "2026-09-23", tradingDaysToExpiry: 20, ivPct: 12.6 }]);
  assert(exact?.method === "exact", "exact 20D");
  assertClose(exact!.iv20, 12.6, 1e-12, "exact IV20");
}

{
  const interp = interpolateIv20([
    { expiry: "2026-09-09", tradingDaysToExpiry: 10, ivPct: 10 },
    { expiry: "2026-10-07", tradingDaysToExpiry: 30, ivPct: 20 },
  ]);
  assert(interp?.method === "interpolated", "variance interpolation");
  const expected = Math.sqrt(((0.1 ** 2 * 10 + 0.2 ** 2 * 30) / 2) / 20) * 100;
  assertClose(interp!.iv20, expected, 1e-10, "total-variance interpolated IV20");
}

{
  const oneSided = interpolateIv20([{ expiry: "2026-10-07", tradingDaysToExpiry: 30, ivPct: 14 }]);
  assert(oneSided === null, "do not use a 30D expiry as IV20");
}

{
  assert(isPlausibleIvDecimal(0.1261), "CBOE ATM decimal IV is plausible");
  assert(!isPlausibleIvDecimal(12.688), "CBOE iv30-style percent must not be treated as contract IV");
}

{
  const asOf = "2026-08-26";
  const spot = 100;
  const options = [
    { option: "SPX260923C00100000", iv: 0.14 },
    { option: "SPX260923P00100000", iv: 0.16 },
    { option: "SPX260923C00050000", iv: 0.9 },
    { option: "SPX261007C00100000", iv: 0.2 },
    { option: "SPX261007P00100000", iv: 0.2 },
  ];
  const byExpiry = atmIvByExpiry(options, spot, asOf);
  const d20 = byExpiry.find((p) => p.expiry === "2026-09-23");
  assert(d20 != null, "ATM expiry present");
  assertClose(d20!.ivPct, 15, 1e-12, "ATM is call/put average at nearest strike");

  const iv20 = iv20FromCboeChain(options, spot, asOf);
  assert(iv20?.method === "interpolated" || iv20?.method === "exact", "IV20 from chain");
  assert(iv20 != null, "IV20 from synthetic chain");
}

// --- Listed options IV20 (Eurex OESX-style, same-strike ATM) ---
{
  const asOf = "2026-08-26";
  const spot = 6469.95;
  const oesx = (expiry: string, type: "call" | "put", strike: number, iv: number): ListedOptionQuote => ({
    symbol: `EUREX:OESX${expiry.replace(/-/g, "")}${type === "call" ? "C" : "P"}${strike}`,
    expiry,
    type,
    strike,
    iv,
    root: "OESX",
    bid: 1,
    ask: 2,
  });
  const oexp = (expiry: string, type: "call" | "put", strike: number, iv: number): ListedOptionQuote => ({
    ...oesx(expiry, type, strike, iv),
    symbol: `EUREX:OEXP${expiry.replace(/-/g, "")}${type === "call" ? "C" : "P"}${strike}`,
    root: "OEXP",
  });

  const chain: ListedOptionQuote[] = [
    oesx("2026-09-18", "call", 6475, 0.134),
    oesx("2026-09-18", "put", 6475, 0.138),
    oesx("2026-09-25", "call", 6475, 0.141),
    oesx("2026-09-25", "put", 6475, 0.145),
    oexp("2026-09-25", "call", 6475, 0.99),
    oexp("2026-09-25", "put", 6475, 0.99),
  ];

  const exactish = iv20FromListedOptions(
    [oesx("2026-09-23", "call", 6475, 0.12), oesx("2026-09-23", "put", 6475, 0.14)],
    spot,
    asOf,
    "OESX",
  );
  assert(exactish?.method === "exact", "exact 20D expiry");
  assert(exactish?.expiry === "2026-09-23", "exact expiry date");
  assertClose(exactish!.iv20, 13, 1e-12, "exact ATM is call/put average");
  assert(exactish?.atmStrike === 6475, "exact ATM strike");
  assert(exactish?.call?.root === "OESX", "exact prefers OESX");

  const iv = iv20FromListedOptions(chain, spot, asOf, "OESX");
  assert(iv?.method === "interpolated", "17d/22d interpolated");
  assert(iv?.expiry === "2026-09-18/2026-09-25", `interp expiry ${iv?.expiry}`);
  const T1 = 17;
  const T2 = 22;
  const w = (20 - T1) / (T2 - T1);
  const var1 = ((0.134 + 0.138) / 2) ** 2 * T1;
  const var2 = ((0.141 + 0.145) / 2) ** 2 * T2;
  const expected = Math.sqrt(((1 - w) * var1 + w * var2) / 20) * 100;
  assertClose(iv!.iv20, expected, 1e-10, "total-variance interpolation");
  assert(iv?.legs?.length === 2, "both listed expiries retained");
  assert(iv?.legs?.[0]?.call.root === "OESX", "prefers OESX over OEXP when complete");
  assert(iv?.legs?.[1]?.call.ivPct < 50, "does not use dummy OEXP IV");

  const incompleteAtm = iv20FromListedOptions(
    [oesx("2026-09-18", "call", 6475, 0.13), oesx("2026-09-18", "put", 6500, 0.13)],
    spot,
    asOf,
    "OESX",
  );
  assert(incompleteAtm == null, "requires call+put at the same ATM strike");
}

// --- Nasdaq OMXS30 series + Black-76 inversion ---
{
  assert(thirdFridayUtc(2026, 9) === "2026-09-18", "Sep 2026 third Friday");
  assert(thirdFridayUtc(2026, 10) === "2026-10-16", "Oct 2026 third Friday");
  const call = parseOmxs30OptionName("OMXS306I3330", 2026);
  assert(call?.type === "call" && call.strike === 3330 && call.expiry === "2026-09-18", "OMXS306I3330");
  const put = parseOmxs30OptionName("OMXS306U3330", 2026);
  assert(put?.type === "put" && put.strike === 3330 && put.expiry === "2026-09-18", "OMXS306U3330");
  assert(parseOmxs30OptionName("OMXS306I", 2026) == null, "future name is not an option");
  assert(parseOmxs30FutureName("OMXS306I", 2026)?.expiry === "2026-09-18", "monthly future still third Friday");

  const weeklyCall = parseOmxs30OptionName("OMXS306I04Y3320", 2026);
  assert(weeklyCall?.type === "call" && weeklyCall.strike === 3320, "weekly call strike");
  assert(weeklyCall?.expiry === "2026-09-04" && weeklyCall.weekly === true, "weekly expiry is calendar day, not third Friday");
  const weeklyPut = parseOmxs30OptionName("OMXS306U11Y3320", 2026);
  assert(weeklyPut?.type === "put" && weeklyPut.expiry === "2026-09-11", "weekly put 11 Sep");
  assert(parseOmxs30OptionName("YXS306I04Y3320", 2026) == null, "YXS30 dailies are not required");
  assert(utcYearMonthDay(2026, 9, 31) == null, "reject invalid weekly calendar day");

  const picked = selectNasdaqPretradeFiles([
    "NordicDerivatives-pretrade-2026-08-28T1800",
    "NordicDerivatives-pretrade-2026-08-28T1759",
    "NordicDerivatives-pretrade-2026-08-28T1659",
    "NordicDerivatives-pretrade-2026-08-28T1559",
  ]);
  assert(picked[0] === "NordicDerivatives-pretrade-2026-08-28T1659", "prefer session :59 snapshot over post-close crumbs");
  assert(nasdaqPretradeAsOf(picked[0]!) === "2026-08-28", "snapshot as-of from filename");

  assert(nordnetExpireIso(1789682400000) === "2026-09-18", "Nordnet expire id is Stockholm calendar date");
  const nnQuotes = nordnetPairToListedQuotes(
    {
      strike_price: 3320,
      call_option: {
        instrument_info: { symbol: "OMXS306I3320" },
        price_info: { bid: { price: 47 }, ask: { price: 51.25 } },
        derivative_info: { expire_date: 1789682400000 },
      },
      put_option: {
        instrument_info: { symbol: "OMXS306U3320" },
        price_info: { bid: { price: 31.75 }, ask: { price: 35.25 } },
        derivative_info: { expire_date: 1789682400000 },
      },
    },
    "2026-08-28",
    3321.44,
  );
  assert(nnQuotes.length === 2, "Nordnet two-sided call/put");
  assert(nnQuotes[0]!.bid === 47 && nnQuotes[0]!.ask === 51.25, "uses bid/ask not last");
  const skippedYxs = nordnetPairToListedQuotes(
    {
      strike_price: 3320,
      call_option: {
        instrument_info: { symbol: "YXS306I04Y3320" },
        price_info: { bid: { price: 10 }, ask: { price: 11 } },
        derivative_info: { expire_date: 1788472800000 },
      },
      put_option: {
        instrument_info: { symbol: "YXS306U04Y3320" },
        price_info: { bid: { price: 10 }, ask: { price: 11 } },
        derivative_info: { expire_date: 1788472800000 },
      },
    },
    "2026-08-28",
    3321.44,
  );
  assert(skippedYxs.length === 0, "YXS30 symbols ignored until launch");

  const T = 23 / 365;
  const vol = 0.16;
  const px = black76Price(3335.5, 3330, T, vol, true);
  const implied = impliedVolBlack76(px, 3335.5, 3330, T, true);
  assert(implied != null, "implied vol exists");
  assertClose(implied!, vol, 1e-4, "Black-76 round-trip");
}

// --- VRP ---
{
  assertClose(computeVrp(14.2, 9.5)!, 4.7, 1e-12, "VRP = IV20 − RV20");
  assert(computeVrp(null, 9.5) === null, "VRP withheld without IV20");
  assert(computeVrp(14.2, null) === null, "VRP withheld without RV20");
}

{
  assert(formatVolPct(9.54) === "9.5%", `format RV ${formatVolPct(9.54)}`);
  assert(formatVrp(4.7) === "+4.7 volatility points", `format VRP ${formatVrp(4.7)}`);
  assert(formatVrp(-1.2) === "−1.2 volatility points", "negative VRP uses minus");
  assert(formatVolPct(null) === "—", "null vol");
}

console.log("test-derivatives-vol: ok");
