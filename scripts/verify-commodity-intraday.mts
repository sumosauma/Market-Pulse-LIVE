/** Verify 1D intraday enablement table. Run: npx tsx scripts/verify-commodity-intraday.mts */
import { writeFileSync } from "node:fs";
import { INTRADAY_MIN_POINTS, isIntradayEnabled } from "../src/lib/commodities/intraday.ts";
import { loadCommodityIntraday } from "../src/lib/commodities/intraday.server.ts";
import { loadCommodityOverview } from "../src/lib/commodities/overview.server.ts";

const overview = await loadCommodityOverview();
const intraday = await loadCommodityIntraday();

const rows = [];
console.log(
  "\nCommodity".padEnd(16),
  "Source".padEnd(28),
  "Interval".padEnd(14),
  "Bars".padStart(5),
  "Session".padEnd(12),
  "1D",
);
for (const quote of overview.quotes) {
  const series = intraday.series.find((s) => s.id === quote.id);
  const enabled = isIntradayEnabled(series);
  const last = series?.points[series.points.length - 1];
  const vsLast =
    enabled && last && quote.price != null && quote.price > 0
      ? (((last.price - quote.price) / quote.price) * 100).toFixed(3) + "%"
      : "—";
  console.log(
    quote.name.padEnd(16),
    (series?.sourceLabel ?? series?.unavailableReason ?? "—").slice(0, 27).padEnd(28),
    (enabled ? series!.interval : "—").padEnd(14),
    String(series?.points.length ?? 0).padStart(5),
    (series?.sessionDate ?? "—").padEnd(12),
    enabled ? "ON" : "OFF",
    `Δlast=${vsLast}`,
  );
  rows.push({
    commodity: quote.name,
    id: quote.id,
    lastSource: quote.sourceLabel,
    lastPrice: quote.price,
    intradaySource: series?.sourceLabel ?? null,
    interval: enabled ? series?.interval : null,
    bars: series?.points.length ?? 0,
    sessionDate: series?.sessionDate ?? null,
    coverage: enabled
      ? `${series!.points.length} bars (≥${INTRADAY_MIN_POINTS})`
      : series?.unavailableReason ?? "unavailable",
    enabled1d: enabled,
    lastBarVsOverviewLastPct: vsLast,
  });
}

const out = { fetchedAt: new Date().toISOString(), minPoints: INTRADAY_MIN_POINTS, rows };
writeFileSync("scripts/verify-commodity-intraday-report.json", JSON.stringify(out, null, 2));
console.log("\nWrote scripts/verify-commodity-intraday-report.json");
