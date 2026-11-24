/**
 * Independent audit of commodity 20D realized vol vs the app payload.
 * Formula: last 21 valid closes → 20 ln returns → sample stdev (n−1) × √252 × 100.
 * Run: npx tsx scripts/validate-commodity-rv20.mts
 */
import {
  computeRv20,
  logReturns,
  sampleStdev,
  annualizeDailyVol,
} from "../src/lib/derivatives/realizedVol.ts";
import { loadCommodityIndicators } from "../src/lib/commodities/indicators.server.ts";
import { RV20_WINDOW } from "../src/lib/derivatives/markets.ts";

function calendarDaysBetween(a: string, b: string): number | null {
  const x = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

function gapOk(window: { date: string }[], maxGap: number): boolean {
  for (let i = 1; i < window.length; i++) {
    const g = calendarDaysBetween(window[i - 1]!.date, window[i]!.date);
    if (g == null || g < 1 || g > maxGap) return false;
  }
  return true;
}

const SOURCE_KIND: Record<string, string> = {
  brent: "continuous front-month futures (Yahoo BZ=F)",
  wti: "continuous front-month futures (Yahoo CL=F)",
  ttf: "continuous front-month futures (Yahoo TTF=F)",
  "henry-hub": "continuous front-month futures (Yahoo NG=F)",
  "nordic-power": "day-ahead system index (Nord Pool SYS)",
  gold: "continuous front-month futures (Yahoo GC=F) — Last quote is spot, chart/RV are futures",
  silver: "continuous front-month futures (Yahoo SI=F) — Last quote is spot, chart/RV are futures",
  copper: "LME cash settlement (Westmetall)",
  aluminium: "LME cash settlement (Westmetall)",
  nickel: "LME cash settlement (Westmetall)",
  wheat: "continuous front-month futures (Yahoo ZW=F)",
  corn: "continuous front-month futures (Yahoo ZC=F)",
};

const payload = await loadCommodityIndicators();
const rows = [];

for (const h of payload.history) {
  const maxGap = h.id === "nordic-power" ? 4 : 14;
  const sorted = [...h.bars].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  for (const p of sorted) {
    if (!(Number.isFinite(p.close) && p.close > 0)) continue;
    byDate.set(p.date, p.close);
  }
  const clean = [...byDate.entries()].map(([date, close]) => ({ date, close }));
  const window = clean.slice(-(RV20_WINDOW + 1));

  let indep: number | null = null;
  let exception: string | null = null;

  if (window.length !== 21) {
    exception = `Need 21 prices, have ${window.length}`;
  } else if (!gapOk(window, maxGap)) {
    exception = "Gap limit exceeded in latest 21";
  } else {
    const rets = logReturns(window.map((p) => p.close));
    if (rets.length !== 20) {
      exception = `Need 20 log returns, got ${rets.length}`;
    } else {
      const sd = sampleStdev(rets)!;
      indep = annualizeDailyVol(sd);
      const lib = computeRv20(clean, { maxGapDays: maxGap });
      if (lib && Math.abs(lib.rv20 - indep) > 1e-9) exception = "lib mismatch log";
    }
  }

  if (h.rvKind !== "ann_pct") {
    exception = `rvKind must be ann_pct, got ${h.rvKind}`;
  }

  const match =
    (h.rv20 == null && indep == null) ||
    (h.rv20 != null && indep != null && Math.abs(h.rv20 - indep) < 1e-6);

  rows.push({
    id: h.id,
    priceHistoryKind: SOURCE_KIND[h.id] ?? h.contractLabel,
    ticker: h.ticker,
    observations: clean.length,
    windowPrices: window.length,
    returns: window.length === 21 ? 20 : null,
    rv20_pct: h.rv20 == null ? null : Number(h.rv20.toFixed(4)),
    rv20_indep: indep == null ? null : Number(indep.toFixed(4)),
    match,
    exception: exception ?? (h.rv20 == null ? h.unavailableReason : null),
  });
}

console.log(JSON.stringify({ fetchedAt: payload.fetchedAt, rows }, null, 2));
if (rows.some((r) => !r.match)) {
  console.error("MISMATCH", rows.filter((r) => !r.match).map((r) => r.id));
  process.exit(1);
}
console.error(`OK ${rows.filter((r) => r.rv20_pct != null).length}/${rows.length} with RV20`);
