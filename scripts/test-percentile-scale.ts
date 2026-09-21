/**
 * Marker-position helper only. Does not calculate percentiles.
 * Run: npx tsx scripts/test-percentile-scale.ts
 */

import { percentileMarkerPercent } from "../src/lib/derivatives/percentileScale.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(percentileMarkerPercent(null) == null, "null");
assert(percentileMarkerPercent(undefined) == null, "undefined");
assert(percentileMarkerPercent(Number.NaN) == null, "NaN");
assert(percentileMarkerPercent(1) === 1, "1");
assert(percentileMarkerPercent(4) === 4, "4");
assert(percentileMarkerPercent(25) === 25, "25");
assert(percentileMarkerPercent(50) === 50, "50");
assert(percentileMarkerPercent(75) === 75, "75");
assert(percentileMarkerPercent(96) === 96, "96");
assert(percentileMarkerPercent(100) === 100, "100");
assert(percentileMarkerPercent(0) === 0, "0");
assert(percentileMarkerPercent(-3) === 0, "clamp below 0");
assert(percentileMarkerPercent(104) === 100, "clamp above 100");
assert(percentileMarkerPercent(3.968253968253968) === 3.968253968253968, "exact value, no rounding");
assert(percentileMarkerPercent(34.12698412698413) === 34.12698412698413, "spread exact");

console.log("percentile scale marker tests passed");
