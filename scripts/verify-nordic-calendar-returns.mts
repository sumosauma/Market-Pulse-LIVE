/**
 * Verification — Nordic SYS calendar-date return references vs durable cache.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  nordicCalendarChangePct,
  nordicCalendarTargetDate,
  type NordicReturnHorizon,
} from "../src/lib/commodities/nordicSysCalendar.ts";

const cachePath = "data/cache/nordic-sys-daily.json";
if (!existsSync(cachePath)) {
  console.error("Missing cache:", cachePath);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(cachePath, "utf8")) as {
  updatedAt?: string;
  bars: { date: string; close: number }[];
};
const bars = raw.bars;
const latest = bars.at(-1)!;
const series = bars.map((b) => ({ date: b.date, price: b.close }));

console.log("=== Durable cache ===");
console.log({
  updatedAt: raw.updatedAt,
  bars: bars.length,
  first: bars[0],
  last: latest,
  note: "mergeBars keeps older dates when the free API window slides forward",
});

console.log("\n=== Reference-date logic (exact delivery date; no substitute) ===");
const horizons: NordicReturnHorizon[] = ["1D", "1W", "1M", "1Y"];
for (const h of horizons) {
  const target = nordicCalendarTargetDate(latest.date, h);
  const hit = bars.find((b) => b.date === target);
  const pct = nordicCalendarChangePct(series, h);
  console.log({
    horizon: h,
    latest: latest.date,
    referenceDate: target,
    referencePrice: hit?.close ?? null,
    presentInCache: hit != null,
    changePct: pct == null ? "N/A" : Number(pct.toFixed(2)),
  });
}

console.log("\n=== Cache retention check ===");
console.log({
  freeApiCurrentlyBlocksBefore: "≈2026-09-22 (HTTP 401)",
  cacheStillHolds: bars[0]?.date,
  retainsOlderThanFreeWindow: bars[0] != null && bars[0].date < "2026-09-22",
});
