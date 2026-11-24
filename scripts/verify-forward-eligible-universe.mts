/**
 * Recompute eligible Forward Repricing universe (completed sessions, strict Yahoo vol).
 * Mirrors production hierarchy outcomes for the report.
 */
import { loadCommoditySignals } from "../src/lib/commodities/signals.server";
import { SIGNAL_THRESHOLDS } from "../src/lib/commodities/signals";

const payload = await loadCommoditySignals();
const forward = payload.signals.filter((s) => s.category === "forward-repricing");

console.log("Active:", payload.futuresRepricingActive);
console.log(
  "Top-2:",
  forward.map((s) => {
    const viz = s.display.viz.kind === "forward-repricing" ? s.display.viz : null;
    return {
      name: s.commodityName,
      sixM: s.primaryReading,
      front: s.contextReading,
      asOf: viz?.currentSettleDate,
      prior: viz?.priorSettleDate,
      frontSym: viz?.frontMonthSymbol,
      sixSym: viz?.sixMonthSymbol,
      source: viz?.priceSource,
      sixRet: viz?.sixMonthRet,
      frontRet: viz?.frontMonthRet,
    };
  }),
);

// Engine ranks only top-2 into payload; re-check activation threshold conceptually
console.log(
  `Threshold ≥${SIGNAL_THRESHOLDS.futuresRepricingMinCommodities}; displayed ${forward.length}`,
);

// Confirm no incomplete Chicago today
const chicagoToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
for (const s of forward) {
  if (s.asOf >= chicagoToday) throw new Error(`Incomplete asOf ${s.asOf}`);
}
console.log("Completed-session check OK (asOf <", chicagoToday + ")");
