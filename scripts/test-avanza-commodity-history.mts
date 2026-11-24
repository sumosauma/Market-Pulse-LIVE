/**
 * Verify Avanza-backed commodity Price History + 20D RV.
 * Run: npx tsx scripts/test-avanza-commodity-history.mts
 */
import { loadCommodityIndicators } from "../src/lib/commodities/indicators.server.ts";
import { AVANZA_COMMODITY_ORDERBOOKS } from "../src/lib/commodities/avanzaCommodityHistory.ts";
import { computeRv20 } from "../src/lib/derivatives/realizedVol.ts";

const payload = await loadCommodityIndicators();
const avanzaIds = new Set(Object.keys(AVANZA_COMMODITY_ORDERBOOKS));

for (const h of payload.history) {
  const expectAvanza = avanzaIds.has(h.id);
  const isAvanza = h.ticker.startsWith("Avanza");
  const rv = computeRv20(
    h.bars.map((b) => ({ date: b.date, close: b.close })),
    { maxGapDays: h.id === "nordic-power" ? 4 : 14 },
  );
  const match =
    h.rvKind === "abs_change"
      ? true
      : (h.rv20 == null && rv == null) ||
        (h.rv20 != null && rv != null && Math.abs(h.rv20 - rv.rv20) < 1e-6);

  console.log(
    [
      h.id.padEnd(12),
      expectAvanza ? (isAvanza ? "AVANZA" : "FALLBACK") : h.ticker.slice(0, 16).padEnd(16),
      `bars=${h.bars.length}`,
      `last=${h.bars.at(-1)?.date ?? "n/a"}@${h.bars.at(-1)?.close ?? "n/a"}`,
      h.rvKind === "abs_change"
        ? `rv20=${h.rv20 == null ? "N/A" : h.rv20.toFixed(2) + " " + h.unit}`
        : `rv20=${h.rv20 == null ? "N/A" : h.rv20.toFixed(2) + "%"}`,
      match ? "ok" : "RV_MISMATCH",
    ].join(" | "),
  );

  if (expectAvanza && !isAvanza) {
    console.error(`  WARN: expected Avanza primary for ${h.id}, got ${h.ticker}`);
  }
  if (!match) process.exitCode = 1;
}

console.log("\nfetchedAt", payload.fetchedAt);
