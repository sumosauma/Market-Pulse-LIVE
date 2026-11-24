import { loadCommoditySignals } from "../src/lib/commodities/signals.server";

const asOf = process.argv[2] ?? "2026-09-28";
const payload = await loadCommoditySignals({ asOf });
console.log({
  requested: asOf,
  asOf: payload.asOf,
  count: payload.signals.length,
  coverageInsufficient: payload.coverageInsufficient,
});
for (const s of payload.signals) {
  const scale = s.display.significanceScale;
  console.log({
    category: s.category,
    name: s.commodityName,
    percentile: scale.percentile,
    level: scale.level,
    label: scale.label,
    filled: scale.filledSegments,
  });
}
