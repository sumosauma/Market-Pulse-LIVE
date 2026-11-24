import type { CSSProperties } from "react";

/** Keep chart hover cards inside the Recharts plot viewBox (flip left near the right edge). */
export function clampChartTooltipAnchor(
  coordinate: { x: number; y: number } | undefined,
  viewBox: { x?: number; y?: number; width?: number; height?: number } | undefined,
  size: { width: number; height: number },
  gap = 12,
): { x: number; y: number } | null {
  if (!coordinate || viewBox?.width == null || viewBox.height == null) return null;
  const vx = viewBox.x ?? 0;
  const vy = viewBox.y ?? 0;
  const vw = viewBox.width;
  const vh = viewBox.height;
  if (!(vw > 0) || !(vh > 0)) return null;

  let x = coordinate.x + gap;
  let y = coordinate.y - size.height / 2;

  if (x + size.width > vx + vw - 4) {
    x = coordinate.x - gap - size.width;
  }

  const minX = vx + 4;
  const maxX = Math.max(minX, vx + vw - size.width - 4);
  const minY = vy + 4;
  const maxY = Math.max(minY, vy + vh - size.height - 4);

  x = Math.min(Math.max(x, minX), maxX);
  y = Math.min(Math.max(y, minY), maxY);
  return { x, y };
}

/** Neutralize Recharts’ default wrapper translate so we can place the card ourselves. */
export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = {
  outline: "none",
  zIndex: 20,
  pointerEvents: "none",
  transform: "translate(0px, 0px)",
  position: "absolute",
  top: 0,
  left: 0,
};
