/** Subtle Navy — premium institutional map monitor (reference-aligned). */

export const MAP_PALETTE = {
  monitorBg: "#ffffff",
  monitorBgDeep: "#ffffff",
  oceanDeep: "#ffffff",
  oceanMid: "#fafbfc",
  oceanLight: "#ffffff",
  /** Pale blue-grey / lavender land — low contrast canvas */
  land: "rgba(186,200,218,0.42)",
  landHover: "rgba(170,188,210,0.52)",
  landSelected: "rgba(148,168,194,0.58)",
  border: "rgba(148,163,184,0.22)",
  borderHover: "rgba(100,116,139,0.32)",
  borderSelected: "rgba(71,85,105,0.4)",
  dotFill: "rgba(100,116,139,0.45)",
  dotRing: "rgba(255,255,255,0.96)",
  dotSelected: "rgba(51,65,85,0.62)",
  dotSelectedRing: "rgba(51,65,85,0.12)",
  cardBg: "#ffffff",
  cardBgSelected: "#ffffff",
  cardBorder: "rgba(226,232,240,0.95)",
  cardBorderSelected: "rgba(148,163,184,0.55)",
  cardShadow: "0 1px 4px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.03)",
  cardShadowHover: "0 4px 14px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)",
  panelBorder: "rgba(226,232,240,0.9)",
  panelShadow: "0 4px 24px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)",
  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  columnHeader: "#334155",
  columnDivider: "rgba(148,163,184,0.35)",
  /** Slightly clearer coastlines in Europe drilldown */
  europeBorder: "rgba(71,85,105,0.38)",
  europeLand: "rgba(186,200,218,0.52)",
  /** Bright reference-style performance colors */
  pctPositive: "#22c55e",
  pctNegative: "#ef4444",
  pctNeutral: "#64748b",
  pctUnavailable: "#94a3b8",
  sparkPositive: "#22c55e",
  sparkNegative: "#ef4444",
  sparkNeutral: "#94a3b8",
} as const;

export function mapLandFill(selected: boolean, hovered: boolean): string {
  if (selected) return MAP_PALETTE.landSelected;
  if (hovered) return MAP_PALETTE.landHover;
  return MAP_PALETTE.land;
}

export function mapPctColor(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return MAP_PALETTE.pctUnavailable;
  if (changePercent > 0.05) return MAP_PALETTE.pctPositive;
  if (changePercent < -0.05) return MAP_PALETTE.pctNegative;
  return MAP_PALETTE.pctNeutral;
}

export function mapSparklineColor(changePercent: number | null): string {
  return mapPctColor(changePercent);
}

export const MAP_WIDTH = 1100;
export const MAP_HEIGHT = 520;
