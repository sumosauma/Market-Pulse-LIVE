import { weekdayCountExclusiveStart } from "./dates";
import { IV20_TARGET_TDTE } from "./markets";
import { parseOccOptionSymbol } from "./occ";

export type CboeOptionRow = {
  option: string;
  iv?: number | null;
};

export type ExpiryAtmIv = {
  expiry: string;
  tradingDaysToExpiry: number;
  /** ATM implied vol in percent. */
  ivPct: number;
};

export type Iv20Contract = {
  symbol: string;
  strike: number;
  ivPct: number;
  root: string;
};

export type Iv20Leg = {
  expiry: string;
  atmStrike: number;
  call: Iv20Contract;
  put: Iv20Contract;
};

export type Iv20Result = {
  iv20: number;
  asOf: string;
  expiry: string;
  method: "exact" | "interpolated";
  spot?: number;
  atmStrike?: number | null;
  call?: Iv20Contract | null;
  put?: Iv20Contract | null;
  nearExpiry?: string | null;
  farExpiry?: string | null;
  /** ATM call/put used at each listed expiry (both legs when interpolating). */
  legs?: Iv20Leg[];
};

const MIN_IV_DECIMAL = 0.03;
const MAX_IV_DECIMAL = 1.5;
const ATM_BAND = 0.025;
const MIN_TDTE = 5;
const MAX_TDTE = 40;

export function isPlausibleIvDecimal(iv: number): boolean {
  return Number.isFinite(iv) && iv >= MIN_IV_DECIMAL && iv <= MAX_IV_DECIMAL;
}

export function cboeIvToPct(ivDecimal: number): number {
  return ivDecimal * 100;
}

/**
 * Constant-maturity 20 trading-day ATM IV from listed expiries.
 * Interpolates total variance when no expiry lands on exactly 20 weekdays.
 */
export function interpolateIv20(
  points: readonly ExpiryAtmIv[],
  targetTdte = IV20_TARGET_TDTE,
): { iv20: number; expiry: string; method: "exact" | "interpolated" } | null {
  const usable = points
    .filter((p) => p.ivPct > 0 && p.tradingDaysToExpiry > 0 && Number.isFinite(p.ivPct))
    .slice()
    .sort((a, b) => a.tradingDaysToExpiry - b.tradingDaysToExpiry);
  if (!usable.length) return null;

  const exact = usable.find((p) => p.tradingDaysToExpiry === targetTdte);
  if (exact) {
    return { iv20: exact.ivPct, expiry: exact.expiry, method: "exact" };
  }

  const below = [...usable].reverse().find((p) => p.tradingDaysToExpiry < targetTdte);
  const above = usable.find((p) => p.tradingDaysToExpiry > targetTdte);
  if (!below || !above) return null;

  const T = targetTdte;
  const T1 = below.tradingDaysToExpiry;
  const T2 = above.tradingDaysToExpiry;
  if (T2 === T1) return null;
  const w = (T - T1) / (T2 - T1);
  const var1 = (below.ivPct / 100) ** 2 * T1;
  const var2 = (above.ivPct / 100) ** 2 * T2;
  const varT = (1 - w) * var1 + w * var2;
  if (varT < 0 || T <= 0) return null;
  const iv20 = Math.sqrt(varT / T) * 100;
  if (!Number.isFinite(iv20)) return null;
  return {
    iv20,
    expiry: `${below.expiry}/${above.expiry}`,
    method: "interpolated",
  };
}

function nearestAtm(
  rows: readonly { strike: number; iv: number }[],
  spot: number,
): { strike: number; iv: number } | null {
  let best: { strike: number; iv: number } | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const dist = Math.abs(row.strike - spot);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Build per-expiry ATM IV (call/put average at the strike nearest spot).
 * CBOE `iv` is a decimal (0.126 = 12.6%). Quote-level `iv30` is 30-day and must not be used.
 */
export function atmIvByExpiry(
  options: readonly CboeOptionRow[],
  spot: number,
  asOfDate: string,
): ExpiryAtmIv[] {
  if (!(spot > 0)) return [];

  type Side = { strike: number; iv: number };
  const byExpiry = new Map<string, { calls: Side[]; puts: Side[] }>();

  for (const opt of options) {
    if (opt.iv == null || !isPlausibleIvDecimal(opt.iv)) continue;
    const parsed = parseOccOptionSymbol(opt.option);
    if (!parsed) continue;
    const tdte = weekdayCountExclusiveStart(asOfDate, parsed.expiry);
    if (tdte < MIN_TDTE || tdte > MAX_TDTE) continue;
    if (Math.abs(parsed.strike - spot) / spot > ATM_BAND) continue;

    let bucket = byExpiry.get(parsed.expiry);
    if (!bucket) {
      bucket = { calls: [], puts: [] };
      byExpiry.set(parsed.expiry, bucket);
    }
    const row = { strike: parsed.strike, iv: opt.iv };
    if (parsed.type === "C") bucket.calls.push(row);
    else bucket.puts.push(row);
  }

  const out: ExpiryAtmIv[] = [];
  for (const [expiry, bucket] of byExpiry) {
    const call = nearestAtm(bucket.calls, spot);
    const put = nearestAtm(bucket.puts, spot);
    if (!call || !put) continue;
    const ivPct = cboeIvToPct((call.iv + put.iv) / 2);
    out.push({
      expiry,
      tradingDaysToExpiry: weekdayCountExclusiveStart(asOfDate, expiry),
      ivPct,
    });
  }
  return out.sort((a, b) => a.tradingDaysToExpiry - b.tradingDaysToExpiry);
}

export function iv20FromCboeChain(
  options: readonly CboeOptionRow[],
  spot: number,
  asOfDate: string,
): Iv20Result | null {
  const points = atmIvByExpiry(options, spot, asOfDate);
  const interpolated = interpolateIv20(points);
  if (!interpolated) return null;
  return {
    iv20: interpolated.iv20,
    asOf: asOfDate,
    expiry: interpolated.expiry,
    method: interpolated.method,
  };
}
