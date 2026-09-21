import type { YieldPointSourceType } from "./types";

export const YIELD_SOURCE_TYPE_LABEL: Record<YieldPointSourceType, string> = {
  official: "Official",
  external: "External",
  interpolated: "Interpolated",
  missing: "Not published (official grid)",
  unavailable: "Temporarily unavailable",
};

export const YIELD_SOURCE_TYPE_SHORT: Record<YieldPointSourceType, string> = {
  official: "O",
  external: "E",
  interpolated: "I",
  missing: "—",
  unavailable: "?",
};

/** Chart dot: official = solid; interpolated = ring; missing = hidden. */
export function chartDotProps(sourceType: YieldPointSourceType): {
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
} | null {
  switch (sourceType) {
    case "official":
      return { r: 3.5, fill: "var(--primary)", stroke: "var(--primary)", strokeWidth: 1 };
    case "external":
      return { r: 3.5, fill: "var(--card)", stroke: "var(--amber-500)", strokeWidth: 1.5 };
    case "interpolated":
      return {
        r: 3.5,
        fill: "var(--card)",
        stroke: "var(--primary)",
        strokeWidth: 1.5,
        strokeDasharray: "2 2",
      };
    case "missing":
      return null;
    case "unavailable":
      return null;
    default:
      return null;
  }
}

export function tableCellClass(sourceType: YieldPointSourceType): string {
  switch (sourceType) {
    case "official":
      return "text-foreground";
    case "external":
      return "text-amber-600 dark:text-amber-400";
    case "interpolated":
      return "text-primary/80 italic";
    case "missing":
      return "text-muted-foreground italic";
    case "unavailable":
      return "text-amber-600/90 dark:text-amber-400/90";
    default:
      return "text-muted-foreground";
  }
}
