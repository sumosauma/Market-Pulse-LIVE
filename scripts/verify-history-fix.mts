/**
 * Verify post-fix history lengths for Nordic / Cu / Al / Ni (localhost).
 */
import { loadCommodityOverview } from "../src/lib/commodities/overview.server.ts";

const NEED = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 } as const;
const IDS = ["nordic-power", "copper", "aluminium", "nickel"] as const;

const overview = await loadCommodityOverview();
console.log("fetchedAt", overview.fetchedAt);

for (const id of IDS) {
  const q = overview.quotes.find((row) => row.id === id);
  if (!q) {
    console.log(id, "MISSING");
    continue;
  }
  const n = q.chart.length;
  const first = q.chart[0];
  const last = q.chart[n - 1];
  console.log(`\n${id}`);
  console.log(`  price=${q.price} ${q.unit}  source=${q.sourceLabel}`);
  console.log(`  chart n=${n}  first=${first?.date}  last=${last?.date}`);
  console.log(`  historyNote=${q.historyNote ?? "—"}`);
  for (const [range, need] of Object.entries(NEED)) {
    const ok = n >= need;
    console.log(`  ${range}: need ${need} → ${ok ? "FULL" : `PARTIAL (${n})`}`);
  }
}
