/** 50% of the 1600px content max — chips keep design size at or below this viewport. */
export const EUROPE_CHIP_GROW_VIEWPORT_HALF = 800;

/** 75% of the 1600px content max — global map labels may grow only above this viewport. */
export const GLOBAL_MAP_LABEL_GROW_VIEWPORT_THRESHOLD = 1200;

/** Content max width — matches PageShell `max-w-[1600px]`. */
const CONTENT_MAX_WIDTH_PX = 1600;

/** Map frame width at full layout — global labels match original design size. */
export const GLOBAL_MAP_LABEL_FULL_WIDTH_PX = 1218;

/** Map frame width at ~50% viewport — floor for label scale (stop shrinking). */
export const GLOBAL_MAP_LABEL_MIN_MAP_WIDTH_PX = 712;

/** Map frame width at ~50% viewport — baseline for Europe chip growth above that. */
export const EUROPE_CHIP_BASE_MAP_WIDTH = 712;

/**
 * Original chip px at ≤50% viewport; grows with map width above that.
 * Never shrinks below 1 (design size). — Europe drilldown only.
 */
export function europeChipGrowScale(viewportWidth: number, mapFrameWidth: number): number {
  if (viewportWidth <= EUROPE_CHIP_GROW_VIEWPORT_HALF) return 1;
  if (mapFrameWidth <= EUROPE_CHIP_BASE_MAP_WIDTH) return 1;
  return mapFrameWidth / EUROPE_CHIP_BASE_MAP_WIDTH;
}

/** How much of the linear shrink to apply (lower = labels stay larger while resizing). */
const GLOBAL_LABEL_SHRINK_RATE = 0.42;

/** Max label scale bump at full layout (only applied above 75% viewport). */
const GLOBAL_MAP_LABEL_GROW_MAX_FACTOR = 1.08;

function easedGlobalLabelScale(mapFrameWidth: number): number {
  const linear = mapFrameWidth / GLOBAL_MAP_LABEL_FULL_WIDTH_PX;
  return 1 - (1 - linear) * GLOBAL_LABEL_SHRINK_RATE;
}

/**
 * Global world map — scale 1 at full size, shrinks slowly with map frame above 50%
 * viewport, then freezes at the eased 50% size (never shrinks further).
 * Unchanged for viewports at or below 75% of content max width.
 */
function baseGlobalMapLabelScale(mapFrameWidth: number, viewportWidth: number): number {
  if (mapFrameWidth <= 0) return 1;

  const minScale = easedGlobalLabelScale(GLOBAL_MAP_LABEL_MIN_MAP_WIDTH_PX);

  if (viewportWidth > 0 && viewportWidth <= EUROPE_CHIP_GROW_VIEWPORT_HALF) {
    return minScale;
  }

  if (mapFrameWidth >= GLOBAL_MAP_LABEL_FULL_WIDTH_PX) return 1;

  return Math.max(minScale, easedGlobalLabelScale(mapFrameWidth));
}

/** Ramp 1 → GLOBAL_MAP_LABEL_GROW_MAX_FACTOR between 75% and full content width. */
function globalMapLabelGrowFactor(viewportWidth: number): number {
  if (viewportWidth <= GLOBAL_MAP_LABEL_GROW_VIEWPORT_THRESHOLD) return 1;

  const span = CONTENT_MAX_WIDTH_PX - GLOBAL_MAP_LABEL_GROW_VIEWPORT_THRESHOLD;
  if (span <= 0) return GLOBAL_MAP_LABEL_GROW_MAX_FACTOR;

  const t = Math.min(1, (viewportWidth - GLOBAL_MAP_LABEL_GROW_VIEWPORT_THRESHOLD) / span);
  return 1 + t * (GLOBAL_MAP_LABEL_GROW_MAX_FACTOR - 1);
}

export function globalMapLabelScale(mapFrameWidth: number, viewportWidth: number): number {
  const base = baseGlobalMapLabelScale(mapFrameWidth, viewportWidth);

  if (viewportWidth <= 0 || viewportWidth <= GLOBAL_MAP_LABEL_GROW_VIEWPORT_THRESHOLD) {
    return base;
  }

  return base * globalMapLabelGrowFactor(viewportWidth);
}
