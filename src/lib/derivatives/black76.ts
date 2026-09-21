/** Black-76 (futures-style) price and implied vol. Used to invert listed OMXS30 option mids. */

function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export function black76Price(
  forward: number,
  strike: number,
  yearFraction: number,
  vol: number,
  isCall: boolean,
  discount = 1,
): number {
  if (!(forward > 0) || !(strike > 0) || !(yearFraction > 0) || !(vol > 0)) {
    const intrinsic = Math.max(isCall ? forward - strike : strike - forward, 0);
    return discount * intrinsic;
  }
  const sT = vol * Math.sqrt(yearFraction);
  const d1 = (Math.log(forward / strike) + 0.5 * vol * vol * yearFraction) / sT;
  const d2 = d1 - sT;
  if (isCall) return discount * (forward * normCdf(d1) - strike * normCdf(d2));
  return discount * (strike * normCdf(-d2) - forward * normCdf(-d1));
}

export function impliedVolBlack76(
  price: number,
  forward: number,
  strike: number,
  yearFraction: number,
  isCall: boolean,
  discount = 1,
): number | null {
  if (!(price > 0) || !(forward > 0) || !(strike > 0) || !(yearFraction > 0)) return null;
  const intrinsic = discount * Math.max(isCall ? forward - strike : strike - forward, 0);
  if (price < intrinsic * 0.98) return null;

  let lo = 1e-4;
  let hi = 3;
  const loPx = black76Price(forward, strike, yearFraction, lo, isCall, discount);
  const hiPx = black76Price(forward, strike, yearFraction, hi, isCall, discount);
  if (price <= loPx) return lo;
  if (price >= hiPx) return null;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const px = black76Price(forward, strike, yearFraction, mid, isCall, discount);
    if (px > price) hi = mid;
    else lo = mid;
  }
  const vol = (lo + hi) / 2;
  return Number.isFinite(vol) && vol > 0 ? vol : null;
}
