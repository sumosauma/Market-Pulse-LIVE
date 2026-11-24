/**
 * Validation: Forward Repricing activation (completed sessions, hierarchy, top-2).
 */
import { loadCommoditySignals } from "../src/lib/commodities/signals.server";

const payload = await loadCommoditySignals();
const forward = payload.signals.filter((s) => s.category === "forward-repricing");

console.log(
  JSON.stringify(
    {
      futuresRepricingActive: payload.futuresRepricingActive,
      inactiveReason: payload.futuresRepricingInactiveReason,
      forwardCount: forward.length,
      topTwo: forward.map((s) => {
        const viz = s.display.viz.kind === "forward-repricing" ? s.display.viz : null;
        return {
          commodity: s.commodityName,
          asOf: s.asOf,
          primary: s.primaryReading,
          context: s.contextReading,
          viz,
          tooltipMethod: s.display.tooltip.method,
        };
      }),
    },
    null,
    2,
  ),
);

if (!payload.futuresRepricingActive || forward.length !== 2) {
  console.error("FAIL: expected active Forward Repricing with exactly 2 observations");
  process.exit(1);
}

const dates = new Set(forward.map((s) => s.asOf));
if (dates.size !== 1) {
  console.error("FAIL: top-two asOf dates are not aligned", [...dates]);
  process.exit(1);
}

const chicagoToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
for (const s of forward) {
  if (s.asOf >= chicagoToday) {
    console.error("FAIL: incomplete/current session used", s.asOf, ">=", chicagoToday);
    process.exit(1);
  }
  const viz = s.display.viz.kind === "forward-repricing" ? s.display.viz : null;
  if (!viz?.frontMonthSymbol || !viz.sixMonthSymbol || !viz.priceSource) {
    console.error("FAIL: missing contract/source metadata", s.commodityName);
    process.exit(1);
  }
}

console.log("\nPASS: Forward Repricing active, aligned completed asOf, metadata present.");
