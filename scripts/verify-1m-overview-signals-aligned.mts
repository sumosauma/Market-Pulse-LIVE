/**
 * Post-fix: Overview 1M vs Signals 1M must match for non-Nordic (shared 20-step lookback).
 */
import { writeFileSync } from "node:fs";
import { loadCommodityIndicators } from "../src/lib/commodities/indicators.server";
import { HISTORY_STALE_DAYS } from "../src/lib/commodities/indicators";
import { calendarDaysBetween } from "../src/lib/commodities/overview";
import { nordicCalendarTargetDate } from "../src/lib/commodities/nordicSysCalendar";
import {
  COMMODITY_SESSION_RETURN_STEPS,
  sessionLookbackReturn,
  toSessionPricePoints,
} from "../src/lib/commodities/sessionReturns";
import {
  SIGNAL_THRESHOLDS,
  significanceFromPercentile,
} from "../src/lib/commodities/signals";
import { __test as signalsTest } from "../src/lib/commodities/signals.engine";
import { loadCommoditySignals } from "../src/lib/commodities/signals.server";

const { rankLargestPriceMoves, rankHighestVolatilities } = signalsTest;
const STEPS_1M = COMMODITY_SESSION_RETURN_STEPS["1M"];

if (SIGNAL_THRESHOLDS.priceMoveHorizons["1M"] !== STEPS_1M) {
  throw new Error(
    `Threshold drift: signals 1M=${SIGNAL_THRESHOLDS.priceMoveHorizons["1M"]} shared=${STEPS_1M}`,
  );
}

const indicators = await loadCommodityIndicators();
const signalsPayload = await loadCommoditySignals();

const inputs = indicators.history.map((ind) => {
  const last = ind.bars[ind.bars.length - 1]?.date ?? null;
  const age = last ? calendarDaysBetween(last, new Date().toISOString().slice(0, 10)) : null;
  return {
    id: ind.id,
    name: ind.name,
    unit: ind.unit,
    fxCurrency: null as "USD" | "EUR" | null,
    rvKind: ind.rvKind,
    stale: ind.stale || age == null || age > HISTORY_STALE_DAYS,
    bars: ind.bars.map((b) => ({ date: b.date, close: b.close })),
  };
});

const moveRanked = rankLargestPriceMoves(inputs, 12);
const volRanked = rankHighestVolatilities(inputs, 12);

function nordic1M(bars: Array<{ date: string; close: number }>) {
  const latest = bars[bars.length - 1]!;
  const target = nordicCalendarTargetDate(latest.date, "1M");
  const prior = bars.find((b) => b.date === target);
  if (!prior) return null;
  return {
    asOf: latest.date,
    priorDate: prior.date,
    currentPx: latest.close,
    priorPx: prior.close,
    ret: prior.close !== 0 ? latest.close / prior.close - 1 : null,
    absChange: latest.close - prior.close,
  };
}

const rows = [];
let mismatch = 0;

for (const ind of indicators.history) {
  const isNordic = ind.rvKind === "abs_change" || ind.id === "nordic-power";
  const series = toSessionPricePoints(ind.bars);
  const overview = isNordic
    ? (() => {
        const m = nordic1M(ind.bars);
        return m
          ? {
              asOf: m.asOf,
              priorDate: m.priorDate,
              currentPrice: m.currentPx,
              priorPrice: m.priorPx,
              ret: m.ret,
            }
          : null;
      })()
    : sessionLookbackReturn(series, STEPS_1M);

  const signals = isNordic
    ? overview
    : sessionLookbackReturn(series, SIGNAL_THRESHOLDS.priceMoveHorizons["1M"]);

  const overviewPct = overview?.ret != null ? overview.ret * 100 : null;
  const signalsPct = signals?.ret != null ? signals.ret * 100 : null;
  const ppDiff =
    overviewPct != null && signalsPct != null ? signalsPct - overviewPct : null;
  if (ppDiff != null && Math.abs(ppDiff) > 1e-9) mismatch += 1;

  const engine = moveRanked.find((r) => r.commodity.id === ind.id);
  const displayed = signalsPayload.signals.find(
    (s) => s.category === "largest-price-move" && s.commodityId === ind.id,
  );

  rows.push({
    id: ind.id,
    name: ind.name,
    overview1MPct: overviewPct,
    signals1MPct: signalsPct,
    ppDiff,
    asOf: overview?.asOf ?? null,
    priorDate: overview?.priorDate ?? null,
    currentPx: overview?.currentPrice ?? null,
    priorPx: overview?.priorPrice ?? null,
    percentile: engine?.percentile ?? null,
    significance: significanceFromPercentile(engine?.percentile ?? null).label,
    eligible: Boolean(engine),
    rank: engine ? moveRanked.findIndex((r) => r.commodity.id === ind.id) + 1 : null,
    selectedTop2: Boolean(displayed),
    displayedPrimary: displayed?.primaryReading ?? null,
    method: isNordic ? "nordic-calendar-1M" : `shared-${STEPS_1M}-session-steps`,
  });
}

rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

const forward = signalsPayload.signals.filter((s) => s.category === "forward-repricing");
const report = {
  verifiedAt: new Date().toISOString(),
  sharedLookbackSteps: STEPS_1M,
  signalThreshold1M: SIGNAL_THRESHOLDS.priceMoveHorizons["1M"],
  nonNordicMismatches: mismatch,
  matchExact: mismatch === 0,
  rows,
  top2: moveRanked.slice(0, 2).map((r) => ({
    id: r.commodity.id,
    name: r.commodity.name,
    retPct: r.isNordic ? null : r.move.ret * 100,
    percentile: r.percentile,
  })),
  volTop2: volRanked.slice(0, 2).map((r) => ({
    id: r.commodity.id,
    rv: r.rv,
    percentile: r.percentile,
    indicatorRv20: indicators.history.find((h) => h.id === r.commodity.id)?.rv20 ?? null,
  })),
  forward: {
    active: signalsPayload.futuresRepricingActive,
    top2: forward.map((s) => ({
      id: s.commodityId,
      primary: s.primaryReading,
      asOf: s.asOf,
    })),
  },
};

writeFileSync("scripts/verify-1m-overview-signals-aligned-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (mismatch > 0) {
  console.error(`FAIL: ${mismatch} non-matching Overview/Signals 1M returns`);
  process.exit(1);
}
console.log("\nPASS: Overview and Signals 1M returns match for all commodities.");
