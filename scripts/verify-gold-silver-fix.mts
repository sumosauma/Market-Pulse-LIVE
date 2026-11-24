import { existsSync, unlinkSync } from "node:fs";
import { loadCommodityOverview } from "../src/lib/commodities/overview.server.ts";

const cache = "data/cache/commodities-overview.json";
if (existsSync(cache)) unlinkSync(cache);

const overview = await loadCommodityOverview();
for (const id of ["gold", "silver"] as const) {
  const q = overview.quotes.find((x) => x.id === id);
  console.log(
    JSON.stringify({
      id,
      price: q?.price ?? null,
      unit: q?.unit,
      source: q?.sourceLabel,
      asOf: q?.asOf,
      change: q?.changePercent1d,
      reason: q?.unavailableReason,
      ok: q?.price != null,
    }),
  );
}
const priced = overview.quotes.filter((q) => q.price != null).length;
console.log(JSON.stringify({ pricedQuotes: priced, goldOk: overview.quotes.find((q) => q.id === "gold")?.price != null, silverOk: overview.quotes.find((q) => q.id === "silver")?.price != null }));
