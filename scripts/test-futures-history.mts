/**
 * Verification for historical futures curve payloads.
 * Run: npm run test:futures-history
 */
import { loadFuturesTermStructure } from "../src/lib/commodities/futuresCurve.server.ts";
import { HISTORY_CURVE_HORIZONS } from "../src/lib/commodities/futuresCurve.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const payload = await loadFuturesTermStructure();
assert(payload.curves.length === 10, `expected 10 curves, got ${payload.curves.length}`);

const report: Array<Record<string, unknown>> = [];

for (const curve of payload.curves) {
  assert(Array.isArray(curve.history), `${curve.id}: history missing`);
  assert(curve.history.length === 4, `${curve.id}: history length ${curve.history.length}`);
  assert(
    HISTORY_CURVE_HORIZONS.every((horizon, index) => curve.history[index]?.horizon === horizon),
    `${curve.id}: history order must be today,1d,1w,1m`,
  );

  const todayMonths = new Set(
    curve.points.filter((p) => !p.gap && p.price != null).map((p) => `${p.year}-${p.monthIndex}`),
  );

  const sessions: string[] = [];
  for (const entry of curve.history) {
    for (const point of entry.points) {
      const key = `${point.year}-${point.monthIndex}`;
      if (entry.horizon !== "today") {
        assert(todayMonths.has(key) || entry.points.length === 0, `${curve.id} ${entry.horizon}: month ${key} not in today`);
      }
      // No interpolation marker — null gaps are allowed; prices must be finite when present.
      if (point.price != null) assert(Number.isFinite(point.price) && point.price > 0, `${curve.id}: bad price`);
    }
    if (entry.sessionDate) sessions.push(`${entry.horizon}:${entry.sessionDate}`);
    report.push({
      id: curve.id,
      horizon: entry.horizon,
      sessionDate: entry.sessionDate,
      source: entry.source,
      priced: entry.points.filter((p) => p.price != null).length,
      spreadM1M2: entry.spreadM1M2,
      spreadM1M6: entry.spreadM1M6,
      shape: entry.shape,
      unavailableReason: entry.unavailableReason,
    });
  }

  const dated = curve.history
    .filter((entry) => entry.sessionDate)
    .map((entry) => entry.sessionDate!);
  for (let i = 1; i < dated.length; i++) {
    assert(dated[i - 1]! > dated[i]!, `${curve.id}: sessionDates must strictly decrease (${dated.join(",")})`);
  }

  console.log(
    curve.id.padEnd(12),
    curve.enabled ? "on" : "off",
    curve.history
      .map((e) => `${e.horizon}:${e.source ?? "—"}@${e.sessionDate ?? "n/a"}(n=${e.points.filter((p) => p.price != null).length})`)
      .join(" | "),
  );
}

console.log("\nOK — historical curve assertions passed");
console.log(JSON.stringify(report, null, 2));
