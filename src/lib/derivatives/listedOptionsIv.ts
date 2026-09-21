import { weekdayCountExclusiveStart } from "./dates";
import {
  interpolateIv20,
  isPlausibleIvDecimal,
  type ExpiryAtmIv,
  type Iv20Contract,
  type Iv20Leg,
  type Iv20Result,
} from "./impliedVol";
import { IV20_TARGET_TDTE } from "./markets";

export type ListedOptionQuote = {
  symbol: string;
  expiry: string;
  type: "call" | "put";
  strike: number;
  iv: number;
  root: string;
  bid: number | null;
  ask: number | null;
};

export type ExpiryAtmDetail = {
  expiry: string;
  tradingDaysToExpiry: number;
  ivPct: number;
  atmStrike: number;
  call: Iv20Contract;
  put: Iv20Contract;
};

const ATM_BAND = 0.03;
const MIN_TDTE = 5;
const MAX_TDTE = 40;

function nearestStrike(strikes: readonly number[], spot: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const strike of strikes) {
    const dist = Math.abs(strike - spot);
    if (dist < bestDist) {
      best = strike;
      bestDist = dist;
    }
  }
  return best;
}

function contractFrom(row: ListedOptionQuote): Iv20Contract {
  return {
    symbol: row.symbol,
    strike: row.strike,
    ivPct: row.iv * 100,
    root: row.root,
  };
}

/**
 * ATM IV per expiry: strike nearest spot, call+put at that same strike.
 * `preferRoot` (e.g. OESX) is used when that root has a complete ATM pair.
 */
export function atmDetailsByExpiry(
  options: readonly ListedOptionQuote[],
  spot: number,
  asOfDate: string,
  preferRoot?: string,
): ExpiryAtmDetail[] {
  if (!(spot > 0)) return [];

  const grouped = new Map<string, ListedOptionQuote[]>();
  for (const opt of options) {
    if (!isPlausibleIvDecimal(opt.iv)) continue;
    const tdte = weekdayCountExclusiveStart(asOfDate, opt.expiry);
    if (tdte < MIN_TDTE || tdte > MAX_TDTE) continue;
    if (Math.abs(opt.strike - spot) / spot > ATM_BAND) continue;
    const list = grouped.get(opt.expiry) ?? [];
    list.push(opt);
    grouped.set(opt.expiry, list);
  }

  const out: ExpiryAtmDetail[] = [];
  for (const [expiry, rows] of grouped) {
    const preferred = preferRoot ? rows.filter((r) => r.root === preferRoot) : rows;
    const detail =
      atmAtExpiry(preferred, spot, expiry, asOfDate) ??
      (preferRoot ? atmAtExpiry(rows, spot, expiry, asOfDate) : null);
    if (detail) out.push(detail);
  }
  return out.sort((a, b) => a.tradingDaysToExpiry - b.tradingDaysToExpiry);
}

function atmAtExpiry(
  rows: readonly ListedOptionQuote[],
  spot: number,
  expiry: string,
  asOfDate: string,
): ExpiryAtmDetail | null {
  const strikes = [...new Set(rows.map((r) => r.strike))];
  const atmStrike = nearestStrike(strikes, spot);
  if (atmStrike == null) return null;
  const call = rows.find((r) => r.type === "call" && r.strike === atmStrike);
  const put = rows.find((r) => r.type === "put" && r.strike === atmStrike);
  if (!call || !put) return null;
  return {
    expiry,
    tradingDaysToExpiry: weekdayCountExclusiveStart(asOfDate, expiry),
    ivPct: ((call.iv + put.iv) / 2) * 100,
    atmStrike,
    call: contractFrom(call),
    put: contractFrom(put),
  };
}

export function iv20FromListedOptions(
  options: readonly ListedOptionQuote[],
  spot: number,
  asOfDate: string,
  preferRoot?: string,
): Iv20Result | null {
  const details = atmDetailsByExpiry(options, spot, asOfDate, preferRoot);
  const points: ExpiryAtmIv[] = details.map((d) => ({
    expiry: d.expiry,
    tradingDaysToExpiry: d.tradingDaysToExpiry,
    ivPct: d.ivPct,
  }));
  const interpolated = interpolateIv20(points, IV20_TARGET_TDTE);
  if (!interpolated) return null;

  const used =
    interpolated.method === "exact"
      ? details.find((d) => d.expiry === interpolated.expiry)
      : null;
  const [nearIso, farIso] =
    interpolated.method === "interpolated" ? interpolated.expiry.split("/") : [null, null];
  const near = nearIso ? details.find((d) => d.expiry === nearIso) : null;
  const far = farIso ? details.find((d) => d.expiry === farIso) : null;
  const primary = used ?? near ?? far ?? details[0] ?? null;
  const legs: Iv20Leg[] = (interpolated.method === "exact" ? [used] : [near, far])
    .filter((d): d is ExpiryAtmDetail => d != null)
    .map((d) => ({
      expiry: d.expiry,
      atmStrike: d.atmStrike,
      call: d.call,
      put: d.put,
    }));

  return {
    iv20: interpolated.iv20,
    asOf: asOfDate,
    expiry: interpolated.expiry,
    method: interpolated.method,
    spot,
    atmStrike: primary?.atmStrike ?? null,
    call: primary?.call ?? null,
    put: primary?.put ?? null,
    nearExpiry: near?.expiry ?? used?.expiry ?? null,
    farExpiry: far?.expiry ?? null,
    legs,
  };
}
