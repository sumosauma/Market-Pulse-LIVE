/**
 * Visualization-only fill for missing historical futures observations.
 * Uses today's verified curve as a shape reference. Never mutates source
 * history; never used for financial metrics.
 */

export type HistoryPricePoint = {
  year: number;
  monthIndex: number;
  price: number | null;
};

export type InterpolatedHistoryPoint = HistoryPricePoint & {
  /** Display price: verified observation or chart-only estimate. */
  displayPrice: number | null;
  /**
   * True when displayPrice was derived (interior shape fill or trailing
   * shape extension) — never a verified observation.
   */
  interpolated: boolean;
};

/** Delivery-month time axis (month units). Equal spacing; no expiry calendar. */
export function deliveryMonthTime(year: number, monthIndex: number): number {
  return year * 12 + monthIndex;
}

function isPositivePrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Month-to-month absolute changes from a reference strip (today).
 * `delta[i]` is ref[i] − ref[i−1] when both months are verified; otherwise null.
 */
function referenceDeltas(reference: ReadonlyArray<number | null>): Array<number | null> {
  const deltas: Array<number | null> = reference.map(() => null);
  for (let i = 1; i < reference.length; i++) {
    const prev = reference[i - 1];
    const cur = reference[i];
    if (!isPositivePrice(prev) || !isPositivePrice(cur)) continue;
    deltas[i] = cur - prev;
  }
  return deltas;
}

function piecewiseLinearFill(
  out: InterpolatedHistoryPoint[],
  leftIndex: number,
  rightIndex: number,
  leftPrice: number,
  rightPrice: number,
): void {
  const leftT = deliveryMonthTime(out[leftIndex]!.year, out[leftIndex]!.monthIndex);
  const rightT = deliveryMonthTime(out[rightIndex]!.year, out[rightIndex]!.monthIndex);
  const span = rightT - leftT;
  if (!(span > 0)) return;
  for (let i = leftIndex + 1; i < rightIndex; i++) {
    if (out[i]!.displayPrice != null) continue;
    const t = deliveryMonthTime(out[i]!.year, out[i]!.monthIndex);
    if (!(t > leftT && t < rightT)) continue;
    const w = (t - leftT) / span;
    const filled = leftPrice + w * (rightPrice - leftPrice);
    if (!Number.isFinite(filled) || !(filled > 0)) continue;
    out[i] = { ...out[i]!, displayPrice: filled, interpolated: true };
  }
}

/**
 * Interior gap: follow reference month-to-month shape, scaled so both verified
 * endpoints remain exact. Falls back to piecewise linear when the reference
 * span is flat or any step lacks a reference delta.
 */
function fillInteriorWithReferenceShape(
  out: InterpolatedHistoryPoint[],
  leftIndex: number,
  rightIndex: number,
  deltas: ReadonlyArray<number | null>,
): void {
  const leftPrice = out[leftIndex]!.displayPrice;
  const rightPrice = out[rightIndex]!.displayPrice;
  if (!isPositivePrice(leftPrice) || !isPositivePrice(rightPrice)) return;
  if (rightIndex - leftIndex < 2) return;

  const stepDeltas: number[] = [];
  for (let i = leftIndex + 1; i <= rightIndex; i++) {
    const d = deltas[i];
    if (d == null || !Number.isFinite(d)) {
      piecewiseLinearFill(out, leftIndex, rightIndex, leftPrice, rightPrice);
      return;
    }
    stepDeltas.push(d);
  }

  const refSpan = stepDeltas.reduce((sum, d) => sum + d, 0);
  const histSpan = rightPrice - leftPrice;
  const scale = Math.abs(refSpan) > 1e-12 ? histSpan / refSpan : null;

  if (scale == null) {
    piecewiseLinearFill(out, leftIndex, rightIndex, leftPrice, rightPrice);
    return;
  }

  let cursor = leftPrice;
  for (let step = 0; step < stepDeltas.length; step++) {
    cursor += scale * stepDeltas[step]!;
    const i = leftIndex + 1 + step;
    if (i >= rightIndex) break; // right endpoint stays verified
    if (!Number.isFinite(cursor) || !(cursor > 0)) {
      piecewiseLinearFill(out, leftIndex, rightIndex, leftPrice, rightPrice);
      return;
    }
    out[i] = { ...out[i]!, displayPrice: cursor, interpolated: true };
  }
}

/**
 * Trailing months after the last verified historical price: walk forward using
 * today's absolute month-to-month changes, preserving the historical level.
 * Stops at the first missing reference delta (no fabrication).
 */
function fillTrailingWithReferenceShape(
  out: InterpolatedHistoryPoint[],
  lastIndex: number,
  deltas: ReadonlyArray<number | null>,
): void {
  let cursor = out[lastIndex]!.displayPrice;
  if (!isPositivePrice(cursor)) return;

  for (let i = lastIndex + 1; i < out.length; i++) {
    if (out[i]!.displayPrice != null) break;
    const d = deltas[i];
    if (d == null || !Number.isFinite(d)) return;
    cursor = cursor + d;
    if (!Number.isFinite(cursor) || !(cursor > 0)) return;
    out[i] = { ...out[i]!, displayPrice: cursor, interpolated: true };
  }
}

/**
 * Fill missing historical display prices for chart overlays only.
 *
 * - Verified historical prices are never changed.
 * - Interior gaps follow today's month-to-month shape, scaled to keep both
 *   verified endpoints exact (linear fallback if reference is insufficient).
 * - Trailing months after the last verified point use today's absolute
 *   month-to-month changes from that anchor level.
 * - Does not invent an entirely missing historical curve (needs ≥1 verified).
 * - Does not extrapolate before the first verified observation.
 */
export function interpolateHistoricalPoints(
  points: ReadonlyArray<HistoryPricePoint>,
  referencePrices: ReadonlyArray<number | null> = [],
): InterpolatedHistoryPoint[] {
  const out: InterpolatedHistoryPoint[] = points.map((point) => ({
    year: point.year,
    monthIndex: point.monthIndex,
    price: point.price,
    displayPrice: isPositivePrice(point.price) ? point.price : null,
    interpolated: false,
  }));

  const anchors: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (isPositivePrice(out[i]!.displayPrice)) anchors.push(i);
  }
  // Never fabricate a whole historical curve from the reference alone.
  if (anchors.length === 0) return out;

  const refAligned =
    referencePrices.length === out.length
      ? referencePrices
      : out.map(() => null as number | null);
  const deltas = referenceDeltas(refAligned);
  const hasAnyReferenceDelta = deltas.some((d) => d != null);

  // Interior gaps between consecutive verified anchors.
  for (let a = 0; a < anchors.length - 1; a++) {
    const left = anchors[a]!;
    const right = anchors[a + 1]!;
    if (right - left < 2) continue;
    if (hasAnyReferenceDelta) {
      fillInteriorWithReferenceShape(out, left, right, deltas);
    } else {
      const lp = out[left]!.displayPrice!;
      const rp = out[right]!.displayPrice!;
      piecewiseLinearFill(out, left, right, lp, rp);
    }
  }

  // Trailing shape extension from the last verified historical price.
  if (hasAnyReferenceDelta) {
    fillTrailingWithReferenceShape(out, anchors[anchors.length - 1]!, deltas);
  }

  return out;
}
