/**
 * Prior-session Avanza fallback + per-series cache merge.
 * Covers: post-midnight sparse today, merge protection, cold cache, auto-switch to today.
 */
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import {
  fetchAvanzaCommodityIntraday,
  shiftIsoCalendarDay,
  type AvanzaCommodityId,
} from "../src/lib/commodities/avanzaCommodityHistory";
import {
  INTRADAY_MIN_POINTS,
  isIntradayEnabled,
  type CommodityIntradayPayload,
  type CommodityIntradaySeries,
} from "../src/lib/commodities/intraday";
import { loadCommodityIntraday } from "../src/lib/commodities/intraday.server";
import {
  clearCommodityIntradaySwrMemoryForTest,
  getCachedCommodityIntraday,
  mergeIntradayLive,
} from "../src/lib/commodities/intraday.cache";

const AVANZA_IDS: AvanzaCommodityId[] = ["brent", "wti", "henry-hub", "gold", "silver"];
const SUPPORTED_1D = ["brent", "wti", "henry-hub", "gold", "silver", "wheat", "corn"] as const;
const DISK = "data/cache/commodities-intraday.json";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function emptyRow(id: string): CommodityIntradaySeries {
  return {
    id,
    points: [],
    interval: "five_minutes",
    source: null,
    sourceLabel: null,
    sessionDate: null,
    exchangeTimezoneName: null,
    unavailableReason: "Intraday data unavailable.",
    stale: false,
  };
}

function eligibleRow(id: string, sessionDate: string, n = 30): CommodityIntradaySeries {
  const points = Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.parse(`${sessionDate}T12:00:00Z`) + i * 5 * 60_000).toISOString(),
    price: 100 + i,
  }));
  return {
    id,
    points,
    interval: "five_minutes",
    source: id === "wheat" || id === "corn" ? "yahoo-futures" : "avanza",
    sourceLabel: "test",
    sessionDate,
    exchangeTimezoneName: null,
    unavailableReason: null,
    stale: sessionDate < "2026-11-26",
  };
}

function payloadOf(rows: CommodityIntradaySeries[]): CommodityIntradayPayload {
  return { series: rows, fetchedAt: new Date().toISOString(), fromStaleCache: false };
}

// --- unit: calendar shift ---
assert(shiftIsoCalendarDay("2026-11-26", -1) === "2026-11-25", "shift -1");
assert(shiftIsoCalendarDay("2026-11-24", -1) === "2026-11-23", "shift weekend step");
console.log("[ok] calendar day shift");

// --- unit: merge protection ---
{
  const prior = payloadOf([
    eligibleRow("brent", "2026-11-25", 40),
    emptyRow("wti"),
    eligibleRow("wheat", "2026-11-25", 40),
  ]);
  const liveSparse = payloadOf([
    emptyRow("brent"), // insufficient overnight
    emptyRow("wti"),
    eligibleRow("wheat", "2026-11-25", 40),
  ]);
  const merged = mergeIntradayLive(liveSparse, prior);
  assert(merged.series.find((s) => s.id === "brent")!.points.length === 40, "keep prior brent");
  assert(merged.series.find((s) => s.id === "brent")!.sessionDate === "2026-11-25", "prior sessionDate");
  assert(merged.series.find((s) => s.id === "wti")!.points.length === 0, "wti still empty");
  assert(merged.series.find((s) => s.id === "wheat")!.points.length === 40, "wheat unchanged");

  const liveToday = payloadOf([
    eligibleRow("brent", "2026-11-26", 30),
    emptyRow("wti"),
    eligibleRow("wheat", "2026-11-26", 30),
  ]);
  const switched = mergeIntradayLive(liveToday, prior);
  assert(switched.series.find((s) => s.id === "brent")!.sessionDate === "2026-11-26", "auto-switch to today");
  assert(switched.series.find((s) => s.id === "brent")!.points.length === 30, "today bars used");
  console.log("[ok] per-series merge protection + auto-switch");
}

// --- live: post-midnight / early session (current clock) ---
{
  const stockholmToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );
  console.log(`\n[live] Stockholm calendar day=${stockholmToday}`);

  for (const id of AVANZA_IDS) {
    const row = await fetchAvanzaCommodityIntraday(id);
    assert(row, `${id}: expected payload`);
    assert(row.bars.length >= INTRADAY_MIN_POINTS, `${id}: expected ≥${INTRADAY_MIN_POINTS} bars, got ${row.bars.length}`);
    assert(row.sessionDate, `${id}: sessionDate required`);
    // If still early for "today", session should be a prior eligible day — not a failure.
    console.log(
      JSON.stringify({
        id,
        bars: row.bars.length,
        sessionDate: row.sessionDate,
        isPriorSession: row.sessionDate !== stockholmToday,
        first: new Date(row.bars[0]!.timestamp).toISOString(),
        last: new Date(row.bars[row.bars.length - 1]!.timestamp).toISOString(),
      }),
    );
  }
  console.log("[ok] Avanza prior-session fallback (or sufficient today)");
}

// --- full loader: seven supported 1D charts ---
{
  const loaded = await loadCommodityIntraday();
  const byId = new Map(loaded.series.map((s) => [s.id, s]));
  for (const id of SUPPORTED_1D) {
    const row = byId.get(id);
    assert(isIntradayEnabled(row), `${id}: 1D must be enabled (points=${row?.points.length ?? 0})`);
    assert(row!.sessionDate, `${id}: sessionDate`);
    assert(row!.unavailableReason == null, `${id}: not a retrieval failure`);
  }
  // Unsupported stay off
  for (const id of ["ttf", "nordic-power", "copper", "aluminium", "nickel"]) {
    assert(!isIntradayEnabled(byId.get(id)), `${id}: must remain unavailable`);
  }
  console.log(
    "[ok] seven supported 1D charts via loadCommodityIntraday",
    SUPPORTED_1D.map((id) => {
      const s = byId.get(id)!;
      return `${id}:${s.points.length}@${s.sessionDate}${s.stale ? "(stale)" : ""}`;
    }),
  );
}

// --- cold cache startup ---
{
  const hadDisk = existsSync(DISK);
  if (hadDisk) unlinkSync(DISK);
  clearCommodityIntradaySwrMemoryForTest();
  const cold = await getCachedCommodityIntraday();
  assert(cold.fromStaleCache === false, "cold load should not be a failed refresh");
  for (const id of SUPPORTED_1D) {
    const row = cold.series.find((s) => s.id === id);
    assert(isIntradayEnabled(row), `cold ${id}: enabled`);
  }
  assert(existsSync(DISK), "cold load should seed disk");
  // Leave the seeded disk in place — do not restore a pre-fix sparse overnight snapshot.
  console.log("[ok] cold-cache startup seeds seven eligible series");
}

writeFileSync(
  "scripts/test-avanza-intraday-prior-session-report.json",
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      note: "See console for per-id coverage",
    },
    null,
    2,
  ),
);
console.log("\n[ok] all prior-session / merge tests passed");
