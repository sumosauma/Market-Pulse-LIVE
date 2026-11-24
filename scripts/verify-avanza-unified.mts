/**
 * Before/after style check: Avanza Last + 1D% vs overview loader + RV series.
 * Run: npx tsx scripts/verify-avanza-unified.mts
 */
import {
  AVANZA_COMMODITY_ORDERBOOKS,
  fetchAvanzaCommodityDailyHistory,
  fetchAvanzaCommodityQuote,
  type AvanzaCommodityId,
} from "../src/lib/commodities/avanzaCommodityHistory.ts";
import { loadCommodityOverview } from "../src/lib/commodities/overview.server.ts";
import { loadCommodityIndicators } from "../src/lib/commodities/indicators.server.ts";
import { computeRv20 } from "../src/lib/derivatives/realizedVol.ts";
import { percentChange } from "../src/lib/commodities/overview.ts";

const IDS: AvanzaCommodityId[] = ["brent", "wti", "henry-hub", "gold", "silver"];

const overview = await loadCommodityOverview();
const indicators = await loadCommodityIndicators();

console.log("\nUnified Avanza Price History check\n");
console.log(
  "id".padEnd(12),
  "avanzaLast".padStart(10),
  "ovLast".padStart(10),
  "dLast".padStart(8),
  "avanza1d".padStart(9),
  "ov1d".padStart(9),
  "d1d".padStart(8),
  "src".padEnd(8),
  "rv20".padStart(8),
  "histBars".padStart(8),
);

const rows = [];
for (const id of IDS) {
  const direct = await fetchAvanzaCommodityQuote(id);
  const daily = await fetchAvanzaCommodityDailyHistory(id);
  const ov = overview.quotes.find((q) => q.id === id);
  const hist = indicators.history.find((h) => h.id === id);
  const calc1d =
    direct?.previousClose != null && direct.last != null
      ? percentChange(direct.last, direct.previousClose)
      : null;
  const lastDelta =
    direct?.last != null && ov?.price != null ? Math.abs(direct.last - ov.price) : null;
  const d1d =
    direct?.changePercent1d != null && ov?.changePercent1d != null
      ? Math.abs(direct.changePercent1d - ov.changePercent1d)
      : null;
  const rv =
    daily && daily.length >= 21
      ? computeRv20(
          daily.map((b) => ({ date: b.date, close: b.close })),
          { maxGapDays: 14 },
        )
      : null;

  const okLast = lastDelta != null && lastDelta < 0.02;
  const ok1d = d1d != null && d1d < 0.05;
  const okSrc = ov?.sourceLabel === "Avanza";
  const okHist = (hist?.bars.length ?? 0) >= 21 && hist?.ticker.startsWith("Avanza");
  const status = okLast && ok1d && okSrc && okHist ? "PASS" : "CHECK";

  console.log(
    id.padEnd(12),
    String(direct?.last ?? "—").padStart(10),
    String(ov?.price ?? "—").padStart(10),
    (lastDelta?.toFixed(4) ?? "—").padStart(8),
    (direct?.changePercent1d?.toFixed(2) ?? "—").padStart(9),
    (ov?.changePercent1d?.toFixed(2) ?? "—").padStart(9),
    (d1d?.toFixed(3) ?? "—").padStart(8),
    (ov?.sourceLabel ?? "—").padEnd(8),
    (hist?.rv20?.toFixed(1) ?? "—").padStart(8),
    String(hist?.bars.length ?? 0).padStart(8),
    status,
  );

  rows.push({
    id,
    orderBookId: AVANZA_COMMODITY_ORDERBOOKS[id],
    avanza: direct,
    calc1dFromPrevClose: calc1d,
    overview: {
      price: ov?.price ?? null,
      changePercent1d: ov?.changePercent1d ?? null,
      sourceLabel: ov?.sourceLabel ?? null,
      asOf: ov?.asOf ?? null,
      chartPoints: ov?.chart.length ?? 0,
      contractLabel: ov?.contractLabel ?? null,
    },
    indicators: {
      ticker: hist?.ticker ?? null,
      rv20: hist?.rv20 ?? null,
      rvPercentile1y: hist?.rvPercentile1y ?? null,
      bars: hist?.bars.length ?? 0,
      contractLabel: hist?.contractLabel ?? null,
    },
    independentRv20: rv?.rv20 ?? null,
    status,
  });
}

const other = overview.quotes.filter((q) => !IDS.includes(q.id as AvanzaCommodityId));
console.log("\nOther commodities (must stay non-Avanza Last):");
for (const q of other) {
  console.log(`  ${q.id.padEnd(14)} source=${q.sourceLabel ?? "—"} last=${q.price}`);
}

console.log("\nDone.");
