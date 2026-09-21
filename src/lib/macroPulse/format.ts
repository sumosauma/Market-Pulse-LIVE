/** Policy Rates Next-column style: "Jul 29, 2026". */
export function formatPanelDate(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Monthly observation label: "May 2026". */
export function formatObservationMonth(observationDate: string): string {
  const d = new Date(`${observationDate.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** @deprecated Use formatObservationMonth */
export function formatAsOfMonth(observationDate: string): string {
  return formatObservationMonth(observationDate);
}

/** Month before `observationDate`, e.g. May 2026 → "Apr 2026". */
export function formatChangeReferenceMonth(observationDate: string): string {
  const [y, m] = observationDate.slice(0, 7).split("-").map(Number);
  const prevIso = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return formatObservationMonth(prevIso);
}

export function formatMetadataLine(observationDate: string, source: string): string {
  return `${formatObservationMonth(observationDate)} · ${source}`;
}

/** SCB month code `2026M05` → ISO `2026-05-01`. */
export function scbMonthToIso(scbMonth: string): string {
  const m = scbMonth.match(/^(\d{4})M(\d{2})$/);
  if (!m) throw new Error(`Invalid SCB month: ${scbMonth}`);
  return `${m[1]}-${m[2]}-01`;
}

export function formatPct(value: number, signed = false): string {
  const rounded = value.toFixed(1);
  if (!signed) return `${rounded}%`;
  if (value > 0) return `+${rounded}%`;
  if (value < 0) return `${rounded}%`;
  return `${rounded}%`;
}

export function formatYoYHeadline(yoy: number): string {
  const sign = yoy > 0 ? "+" : "";
  return `${sign}${yoy.toFixed(1)}% YoY`;
}

export function formatMoMSecondary(value: number): string {
  const rounded = value.toFixed(1);
  if (value > 0) return `MoM +${rounded}%`;
  if (value < 0) return `MoM ${rounded}%`;
  return `MoM ${rounded}%`;
}

export function formatThousandsChange(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}k`;
  if (rounded < 0) return `${rounded}k`;
  return `${rounded}k`;
}

export type MacroChangeDirection = "up" | "down" | "flat";

function changeDirection(delta: number, epsilon = 0.05): MacroChangeDirection {
  if (Math.abs(delta) < epsilon) return "flat";
  return delta > 0 ? "up" : "down";
}

export function formatPpDelta(delta: number): { value: string; direction: MacroChangeDirection } {
  const direction = changeDirection(delta, 0.05);
  const rounded = delta.toFixed(1);
  const value =
    direction === "flat" ? `${rounded} pp` : `${delta > 0 ? "+" : ""}${rounded} pp`;
  return { value, direction };
}

export function formatKDelta(delta: number): { value: string; direction: MacroChangeDirection } {
  const direction = changeDirection(Math.round(delta), 0);
  const rounded = Math.round(delta);
  const value =
    direction === "flat" ? `${rounded}k` : `${rounded > 0 ? "+" : ""}${rounded}k`;
  return { value, direction };
}

export function formatIndexLevel(value: number): string {
  return value.toFixed(1);
}

export function formatIndexDelta(delta: number): { value: string; direction: MacroChangeDirection } {
  const direction = changeDirection(delta, 0.05);
  const rounded = delta.toFixed(1);
  const value =
    direction === "flat" ? `${rounded}` : `${delta > 0 ? "+" : ""}${rounded}`;
  return { value, direction };
}

/** @deprecated Use formatPpDelta */
export function formatVsPriorPp(delta: number): { display: string; direction: MacroChangeDirection } {
  const { value, direction } = formatPpDelta(delta);
  return { display: value, direction };
}

/** @deprecated Use formatKDelta */
export function formatVsPriorK(delta: number): { display: string; direction: MacroChangeDirection } {
  const { value, direction } = formatKDelta(delta);
  return { display: value, direction };
}

export const CHANGE_LABEL_FROM_PREVIOUS = "from previous release";
