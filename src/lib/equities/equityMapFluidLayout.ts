/** Side panel ramps from 0 → max between these layout container widths (px). */
export const EQUITY_PANEL_RAMP_START_PX = 1024;
export const EQUITY_PANEL_RAMP_END_PX = 1280;
export const EQUITY_PANEL_MAX_WIDTH_PX = 280;

/** Gap between map and side panel in the old two-column monitor layout. */
export const EQUITY_MONITOR_GRID_GAP_PX = 20;

export function fluidEquityPanelWidth(containerWidth: number): number {
  if (containerWidth <= EQUITY_PANEL_RAMP_START_PX) return 0;
  if (containerWidth >= EQUITY_PANEL_RAMP_END_PX) return EQUITY_PANEL_MAX_WIDTH_PX;

  const t =
    (containerWidth - EQUITY_PANEL_RAMP_START_PX) /
    (EQUITY_PANEL_RAMP_END_PX - EQUITY_PANEL_RAMP_START_PX);

  return Math.round(t * EQUITY_PANEL_MAX_WIDTH_PX);
}

/**
 * Max width for the stacked map + selector block — matches the old map column width
 * when the detail panel sat on the right (fluid 0–280px reservation).
 */
export function fluidEquityMonitorMaxWidth(containerWidth: number): number | undefined {
  const panel = fluidEquityPanelWidth(containerWidth);
  if (panel <= 0 || containerWidth <= 0) return undefined;
  return Math.max(320, containerWidth - panel - EQUITY_MONITOR_GRID_GAP_PX);
}
