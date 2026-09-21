/** Heatmap fill colors — institutional, muted palette. */
export const HEATMAP_UNCONFIGURED = "#1c1c1f";
export const HEATMAP_NO_DATA = "#3f3f46";
export const HEATMAP_NEUTRAL = "#71717a";

const STRONG_RED = "#991b1b";
const LIGHT_RED = "#dc2626";
const LIGHT_GREEN = "#16a34a";
const STRONG_GREEN = "#14532d";

/** Map 1D % change to fill color. null = unavailable data for configured market. */
export function heatmapFill(changePercent: number | null, configured: boolean): string {
  if (!configured) return HEATMAP_UNCONFIGURED;
  if (changePercent === null || !Number.isFinite(changePercent)) return HEATMAP_NO_DATA;
  if (changePercent <= -2) return STRONG_RED;
  if (changePercent <= -0.5) return LIGHT_RED;
  if (changePercent >= 2) return STRONG_GREEN;
  if (changePercent >= 0.5) return LIGHT_GREEN;
  return HEATMAP_NEUTRAL;
}

export function changePctClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "text-muted-foreground";
  if (changePercent > 0.05) return "text-[#22c55e]";
  if (changePercent < -0.05) return "text-[#ef4444]";
  return "text-[#64748b]";
}

export const HEATMAP_LEGEND = [
  { label: "≤ −2.0%", color: STRONG_RED },
  { label: "−2.0 to −0.5%", color: LIGHT_RED },
  { label: "−0.5 to +0.5%", color: HEATMAP_NEUTRAL },
  { label: "+0.5 to +2.0%", color: LIGHT_GREEN },
  { label: "≥ +2.0%", color: STRONG_GREEN },
] as const;
