/**
 * Verify Cross-Market history metrics (live values untouched; parallel series only).
 */
import {
  crossMarketCommentary,
  crossMarketHistoryStats,
  joinRatioSeries,
  joinSpreadSeries,
} from "../src/lib/commodities/indicators.ts";
import { loadCommodityIndicators } from "../src/lib/commodities/indicators.server.ts";

function markerPct(v: number, low: number, high: number) {
  const span = high - low;
  if (!(span > 0)) return 50;
  return Math.min(100, Math.max(0, ((v - low) / span) * 100));
}

const payload = await loadCommodityIndicators();
const { brentWti, goldSilver } = payload;

console.log("=== Live values (must remain from listed/spot loaders) ===");
console.log({
  brentWtiLive: brentWti.value,
  brentWtiMonth: brentWti.monthLabel,
  brentWtiSession: brentWti.sessionDate,
  goldSilverLive: goldSilver.value,
  goldAt: goldSilver.goldAt,
});

console.log("\n=== Brent–WTI history (same listed pair as live) ===");
const bw = brentWti.history;
console.log({
  liveSymbols: { brent: brentWti.brentSymbol, wti: brentWti.wtiSymbol, month: brentWti.monthLabel },
  liveValue: brentWti.value,
  history: bw,
});
if (bw.unavailableReason == null && bw.latest != null && bw.weekAgo != null && bw.yearLow != null && bw.yearHigh != null) {
  console.log({
    weekChangeCheck: Number((bw.latest - bw.weekAgo).toFixed(6)),
    weekChangeField: bw.weekChange,
    liveVsHistLatest: brentWti.value != null ? brentWti.value - bw.latest : null,
    todayPct: markerPct(bw.latest, bw.yearLow, bw.yearHigh),
    weekPct: markerPct(bw.weekAgo, bw.yearLow, bw.yearHigh),
    commentary: crossMarketCommentary("brent-wti", bw),
  });
}

console.log("\n=== Gold/Silver history (Avanza join) ===");
const gs = goldSilver.history;
console.log(gs);
if (gs.unavailableReason == null && gs.latest != null && gs.weekAgo != null && gs.yearLow != null && gs.yearHigh != null) {
  console.log({
    weekChangeCheck: Number((gs.latest - gs.weekAgo).toFixed(6)),
    weekChangeField: gs.weekChange,
    todayPct: markerPct(gs.latest, gs.yearLow, gs.yearHigh),
    weekPct: markerPct(gs.weekAgo, gs.yearLow, gs.yearHigh),
    commentary: crossMarketCommentary("gold-silver", gs),
  });
}

console.log("\n=== Unit: overlapping markers + near-high commentary ===");
const flat = [
  { date: "2026-01-01", value: 10 },
  { date: "2026-01-02", value: 10 },
  { date: "2026-01-03", value: 10 },
  ...Array.from({ length: 60 }, (_, i) => ({ date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`, value: 10 + (i % 3) })),
];
// Force enough length with synthetic series for join helpers smoke
const left = Array.from({ length: 80 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
  close: 80 + (i % 5),
}));
const right = left.map((row) => ({ date: row.date, close: 70 + (row.close % 4) }));
const spreadSeries = joinSpreadSeries(left, right);
const stats = crossMarketHistoryStats(spreadSeries);
console.log({
  joined: spreadSeries.length,
  statsOk: stats.unavailableReason == null,
  weekChange: stats.weekChange,
  commentary: crossMarketCommentary("brent-wti", stats),
});

const nearHigh: typeof stats = {
  ...stats,
  latest: stats.yearHigh,
  weekChange: 0.1,
};
console.log({ nearHighComment: crossMarketCommentary("brent-wti", nearHigh) });

const ratioSeries = joinRatioSeries(
  left.map((r) => ({ ...r, close: 2000 + (r.close % 10) })),
  right.map((r) => ({ ...r, close: 24 + (r.close % 3) })),
);
console.log({
  ratioJoined: ratioSeries.length,
  ratioStats: crossMarketHistoryStats(ratioSeries).unavailableReason,
  flatLen: flat.length,
});

console.log("\nDone.");
