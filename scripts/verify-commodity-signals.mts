/**
 * Smoke-check Commodity Market Signals (top-2 per category + FX pairs).
 */
import { loadCommoditySignals } from "../src/lib/commodities/signals.server";
import {
  applyLifecycle,
  mergeLifecycleState,
  type LifecycleState,
  type RawSignal,
} from "../src/lib/commodities/signals.engine";

console.log("=== Lifecycle smoke ===");
const base: RawSignal = {
  id: "aluminium:highest-volatility",
  lifecycleKey: "aluminium:highest-volatility",
  commodityId: "aluminium",
  commodityName: "Aluminium",
  category: "highest-volatility",
  categoryLabel: "20D RV",
  asOf: "2026-11-24",
  observation: "test",
  primaryReading: "42.1%",
  primaryValue: null,
  contextReading: "20D RV",
  exposureNote: null,
  unusualness: 97,
  analysisView: "history",
  analysisRange: "1Y",
  display: {
    headline: "20D RV",
    eyebrow: "Aluminium",
    metricLabel: "20D RV",
    interpretation: "test",
    development: "",
    consequence: "test",
    exposure: "test",
    significance: "97th %ile",
    significanceScale: {
      level: "Extreme",
      label: "Extreme",
      filledSegments: 4,
      percentile: 97,
      historyStart: "2025-10-14",
    },
    historyStart: "2025-10-14",
    tooltip: {
      asOf: "2026-11-24",
      sampleSize: 252,
      threshold: "test",
      method: "test",
      benchmark: "Aluminium",
    },
    viz: { kind: "regime-compare", priorPercentile: 75, currentPercentile: 97 },
  },
};

const first = applyLifecycle([base], null);
console.log({ firstStatus: first[0]?.status, expectNull: true });

let state: LifecycleState = mergeLifecycleState(
  null,
  [{ lifecycleKey: "aluminium:highest-volatility", asOf: "2026-11-20", available: true, active: true }],
  new Map([["aluminium:highest-volatility", null]]),
);
state = mergeLifecycleState(
  state,
  [{ lifecycleKey: "aluminium:highest-volatility", asOf: "2026-11-21", available: true, active: false }],
  new Map(),
);
const reappear = applyLifecycle([{ ...base, asOf: "2026-11-24" }], state);
console.log({ afterQuiet: reappear[0]?.status, expectNew: true });

console.log("\n=== Live category observations ===");
const payload = await loadCommoditySignals();
console.log({
  asOf: payload.asOf,
  count: payload.signals.length,
  categories: payload.signals.map((s) => s.category),
  futuresRepricingActive: payload.futuresRepricingActive,
  futuresRepricingInactiveReason: payload.futuresRepricingInactiveReason,
});
for (const s of payload.signals) {
  console.log({
    category: s.category,
    commodity: s.commodityName,
    primary: s.primaryReading,
    eyebrow: s.display.eyebrow,
    significance: s.display.significanceScale.label,
    viz: s.display.viz.kind,
    unusualness: Number(s.unusualness.toFixed(2)),
  });
}
console.log("\nDone.");
