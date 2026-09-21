import type { YieldComparisonId, YieldCurveByMaturity, YieldCurveSnapshot } from "./types";
import { YIELD_CURVE_MATURITIES, YIELD_MATURITY_YEAR_FRACTION } from "./types";

/** Static mock timestamp for the prototype (no live clock dependency). */
export const MOCK_YIELD_CURVES_LAST_UPDATED_ISO = "2026-05-13T15:30:00.000Z";

export interface MockYieldCurveCountryPack {
  label: string;
  /** Current / “as of” curve (displayed as the primary line). */
  current: YieldCurveByMaturity;
  /** Comparison curve for each selector option. */
  comparisonByTenor: Record<YieldComparisonId, YieldCurveByMaturity>;
}

function assertCurve(c: YieldCurveByMaturity): YieldCurveByMaturity {
  for (const k of YIELD_CURVE_MATURITIES) {
    if (typeof c[k] !== "number" || Number.isNaN(c[k])) {
      throw new Error(`Invalid mock yield for ${k}`);
    }
  }
  return c;
}

/**
 * United States — illustrative only. Values are not sourced from live markets.
 * Shapes are chosen so each comparison tenor produces a distinct curve-move story in the UI.
 */
const USA_CURRENT = assertCurve({
  "1M": 4.38,
  "3M": 4.32,
  "6M": 4.28,
  "1Y": 4.22,
  "2Y": 4.18,
  "5Y": 4.25,
  "10Y": 4.48,
  "30Y": 4.72,
});

const USA_TODAY_OPEN = assertCurve({
  "1M": 4.34,
  "3M": 4.25,
  "6M": 4.24,
  "1Y": 4.2,
  "2Y": 4.15,
  "5Y": 4.18,
  "10Y": 4.35,
  "30Y": 4.55,
});

const USA_1D = assertCurve({
  "1M": 4.28,
  "3M": 4.18,
  "6M": 4.19,
  "1Y": 4.17,
  "2Y": 4.12,
  "5Y": 4.2,
  "10Y": 4.38,
  "30Y": 4.5,
});

const USA_1W = assertCurve({
  "1M": 4.15,
  "3M": 4.05,
  "6M": 4.08,
  "1Y": 4.1,
  "2Y": 4.08,
  "5Y": 4.12,
  "10Y": 4.22,
  "30Y": 4.35,
});

const USA_1M = assertCurve({
  "1M": 4.02,
  "3M": 3.95,
  "6M": 3.98,
  "1Y": 4.02,
  "2Y": 4.05,
  "5Y": 4.08,
  "10Y": 4.12,
  "30Y": 4.18,
});

const USA_3M = assertCurve({
  "1M": 4.48,
  "3M": 4.4,
  "6M": 4.35,
  "1Y": 4.28,
  "2Y": 4.2,
  "5Y": 4.15,
  "10Y": 4.1,
  "30Y": 4.05,
});

const USA_1Y_HIST = assertCurve({
  "1M": 5.55,
  "3M": 5.4,
  "6M": 5.25,
  "1Y": 5.05,
  "2Y": 4.85,
  "5Y": 4.55,
  "10Y": 4.45,
  "30Y": 4.55,
});

export const MOCK_YIELD_CURVE_COUNTRIES: Record<"US", MockYieldCurveCountryPack> = {
  US: {
    label: "United States",
    current: USA_CURRENT,
    comparisonByTenor: {
      Today: USA_TODAY_OPEN,
      "1D": USA_1D,
      "1W": USA_1W,
      "1M": USA_1M,
      "3M": USA_3M,
      "1Y": USA_1Y_HIST,
    },
  },
};

/** Last-resort illustrative snapshot aligned with YieldCurveSnapshot. */
export function buildMockYieldCurveSnapshot(comparisonId: YieldComparisonId): YieldCurveSnapshot {
  const pack = MOCK_YIELD_CURVE_COUNTRIES.US;
  const cur = pack.current;
  const cmp = pack.comparisonByTenor[comparisonId];
  const points = YIELD_CURVE_MATURITIES.map((maturity) => {
    const cu = cur[maturity];
    const co = cmp[maturity];
    return {
      maturity,
      years: YIELD_MATURITY_YEAR_FRACTION[maturity],
      currentYield: cu,
      comparisonYield: co,
      changeBps: (cu - co) * 100,
    };
  });

  return {
    countryId: "US",
    country: "United States",
    date: MOCK_YIELD_CURVES_LAST_UPDATED_ISO.slice(0, 10),
    comparisonDate: "mock-session",
    source: "Mock (illustrative)",
    updatedAt: MOCK_YIELD_CURVES_LAST_UPDATED_ISO,
    points,
  };
}

export const MOCK_COUNTRY_OPTIONS = [{ id: "US" as const, label: "United States" }];

export const MOCK_COMPARISON_OPTIONS: { id: YieldComparisonId; label: string }[] = [
  { id: "Today", label: "Today" },
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "1Y", label: "1Y" },
];
