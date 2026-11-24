/**
 * Targeted CME parse / filter / horizon tests (no network).
 * Run: npx tsx scripts/test-cme-futures-parse.mts
 */
import assert from "node:assert/strict";
import {
  MAX_CURVE_POINTS,
  buildListedSlots,
  classifyFuturesCurve,
  curveWithinHorizon,
  calendarSpread,
  nextGrain,
  nextMonthly,
  type FuturesCurve,
  type FuturesContractPoint,
} from "../src/lib/commodities/futuresCurve.ts";
import {
  assembleCme,
  futuresCurveSpecById,
  keepCmeSettlementRow,
  parseCmeActivity,
  parseCmeMonthLabel,
  parseCmeSettle,
} from "../src/lib/commodities/futuresCurve.server.ts";

function pass(name: string) {
  console.log(`PASS  ${name}`);
}

assert.equal(MAX_CURVE_POINTS, 13, "MAX_CURVE_POINTS must cover the 12M strip plus one reach-through");
pass("MAX_CURVE_POINTS === 13");

assert.deepEqual(parseCmeMonthLabel("DEC '26"), { year: 2026, monthIndex: 11 });
assert.deepEqual(parseCmeMonthLabel("Jan 27"), { year: 2027, monthIndex: 0 });
assert.equal(parseCmeMonthLabel("Total"), null);
pass("parseCmeMonthLabel");

assert.equal(parseCmeSettle("59.12"), 59.12);
assert.equal(parseCmeSettle("578'2"), 578.25);
assert.equal(parseCmeSettle("1,234.5"), 1234.5);
pass("parseCmeSettle (decimal + grain eighths)");

assert.equal(parseCmeActivity(undefined), null);
assert.equal(parseCmeActivity("-"), null);
assert.equal(parseCmeActivity(""), null);
assert.equal(parseCmeActivity("0"), 0);
assert.equal(parseCmeActivity("1,234"), 1234);
pass("parseCmeActivity null vs zero");

assert.equal(keepCmeSettlementRow(0, 100), true, "zero volume + positive OI kept");
assert.equal(keepCmeSettlementRow(50, 0), true, "positive volume + zero OI kept");
assert.equal(keepCmeSettlementRow(0, 0), false, "explicit zero/zero discarded");
assert.equal(keepCmeSettlementRow(null, null), true, "missing activity kept");
assert.equal(keepCmeSettlementRow(0, null), true, "zero vol + unknown OI kept");
assert.equal(keepCmeSettlementRow(null, 0), true, "unknown vol + zero OI kept");
pass("keepCmeSettlementRow filter");

const monthly = Array.from({ length: 30 }, (_, i) => {
  const year = 2026 + Math.floor((10 + i) / 12);
  const monthIndex = (10 + i) % 12;
  return { year, monthIndex, price: 50 + i * 0.1 };
});
const slots = buildListedSlots(monthly, nextMonthly);
const contracts = slots.filter((s) => s.kind === "contract");
assert.equal(contracts.length, 13, "buildListedSlots caps at MAX_CURVE_POINTS");
pass("buildListedSlots caps at 12M + reach-through");

assert.equal(classifyFuturesCurve([10, 11, 12]), "Contango");
assert.equal(classifyFuturesCurve([12, 11, 10]), "Backwardation");
assert.equal(classifyFuturesCurve([10, 12, 11]), "Mixed");
assert.equal(calendarSpread(10, 12), -2);
pass("curve analytics helpers");

function point(partial: Partial<FuturesContractPoint> & Pick<FuturesContractPoint, "year" | "monthIndex" | "price">): FuturesContractPoint {
  return {
    symbol: "X",
    label: `${partial.monthIndex}/${partial.year}`,
    axisLabel: `${partial.monthIndex}/${partial.year}`,
    gap: false,
    sessionDate: "2026-11-19",
    quotedAt: "2026-11-19T21:00:00.000Z",
    volume: 1,
    earlierQuote: false,
    expiring: false,
    ...partial,
  };
}

const baseCurve: FuturesCurve = {
  id: "wti",
  name: "WTI",
  enabled: true,
  exchange: "NYMEX",
  currency: "USD",
  unit: "USD/bbl",
  digits: 2,
  sourceLabel: "CME settlements",
  quotedFrom: "2026-11-19T21:00:00.000Z",
  quotedTo: "2026-11-19T21:00:00.000Z",
  sessionDate: "2026-11-19",
  sessionNote: "Official CME Group settlement prices for trade date 2026-11-19.",
  spreadCaution: null,
  contractNote: "test",
  points: [
    point({ year: 2026, monthIndex: 10, price: 60 }),
    point({ year: 2026, monthIndex: 11, price: 61 }),
    point({ year: 2027, monthIndex: 0, price: 62 }),
    point({ year: 2027, monthIndex: 1, price: 63 }),
    point({ year: 2027, monthIndex: 2, price: 64 }),
    point({ year: 2027, monthIndex: 3, price: 65 }),
    point({ year: 2027, monthIndex: 4, price: 66 }),
  ],
  shape: "Contango",
  spreadM1M2: -1,
  spreadM1M2Label: "Nov 2026 − Dec 2026",
  spreadM1M6: -5,
  spreadM1M6Label: "Nov 2026 − Apr 2027",
  unavailableReason: null,
};

const now = new Date("2026-11-20T15:00:00Z");
const h6 = curveWithinHorizon(baseCurve, 6, now);
assert.ok(h6.sessionNote?.includes("Official CME Group settlement"));
assert.ok(h6.points.length >= 2);
assert.equal(h6.spreadM1M2Label, "10/2026 − 11/2026");
pass("curveWithinHorizon preserves CME session note + spreads");

// Sparse grain cycle: Sep 2027 is inside 12M but short of Nov 2027 maturity — keep Dec 2027 beyond.
const grainCurve: FuturesCurve = {
  ...baseCurve,
  id: "wheat",
  name: "Wheat",
  points: [
    point({ year: 2026, monthIndex: 11, price: 500 }),
    point({ year: 2027, monthIndex: 2, price: 510 }),
    point({ year: 2027, monthIndex: 4, price: 520 }),
    point({ year: 2027, monthIndex: 6, price: 530 }),
    point({ year: 2027, monthIndex: 8, price: 540 }),
    point({ year: 2027, monthIndex: 11, price: 550 }),
  ],
};
const grainSlots = buildListedSlots(
  grainCurve.points.map((p) => ({ year: p.year, monthIndex: p.monthIndex, price: p.price! })),
  nextGrain,
);
assert.ok(grainSlots.length >= 5);
const grain12 = curveWithinHorizon(grainCurve, 12, now);
const grainLast = grain12.points.filter((p) => !p.gap && p.price != null).at(-1);
assert.equal(grainLast?.year, 2027);
assert.equal(grainLast?.monthIndex, 11, "12M grain view reaches through to Dec 2027");
pass("12M horizon reach-through includes next listed grain beyond boundary");

const monthly12 = curveWithinHorizon(baseCurve, 12, now);
const monthlyLast = monthly12.points.filter((p) => !p.gap && p.price != null).at(-1);
// baseCurve only runs through Apr 2027 — still short; no beyond contract to pull
assert.ok(monthlyLast);
pass("12M monthly without beyond-boundary contract stays at last available");

const wti = futuresCurveSpecById("wti");
assert.ok(wti);
const partialRows = [
  { year: 2026, monthIndex: 10, price: 60.1, volume: 100, openInterest: 1000, sessionDate: "2026-11-19" },
  { year: 2026, monthIndex: 11, price: 60.4, volume: 0, openInterest: 900, sessionDate: "2026-11-19" },
  { year: 2027, monthIndex: 0, price: 60.8, volume: 0, openInterest: 800, sessionDate: "2026-11-19" },
  // gap Feb intentionally missing — must NOT force Yahoo; partial CME stays
  { year: 2027, monthIndex: 2, price: 61.2, volume: 10, openInterest: 700, sessionDate: "2026-11-19" },
];
const partial = assembleCme(wti!, { sessionDate: "2026-11-19", rows: partialRows }, now);
assert.equal(partial.enabled, true);
assert.equal(partial.sourceLabel, "CME settlements");
assert.ok(partial.points.some((p) => p.gap), "missing month becomes gap, not Yahoo switch");
assert.ok(partial.points.every((p) => !p.gap || p.price == null));
assert.ok(new Set(partial.points.filter((p) => !p.gap).map((p) => p.sessionDate)).size === 1);
pass("partial CME curve kept (no whole-curve Yahoo switch on single gap)");

const empty = assembleCme(wti!, { sessionDate: "2026-11-19", rows: [] }, now);
assert.equal(empty.enabled, false);
pass("zero CME rows → unavailable (caller may Yahoo-fallback)");

const staleDup = assembleCme(
  wti!,
  {
    sessionDate: "2026-11-19",
    rows: [
      ...partialRows,
      { year: 2026, monthIndex: 10, price: 99, volume: 1, openInterest: 1, sessionDate: "2026-11-19" },
    ],
  },
  now,
);
const nov = staleDup.points.find((p) => p.monthIndex === 10 && p.year === 2026);
assert.equal(nov?.price, 60.1, "duplicate delivery month keeps first settle");
pass("duplicate CME month deduped");

console.log("\nAll CME parse/filter/horizon tests passed.");
