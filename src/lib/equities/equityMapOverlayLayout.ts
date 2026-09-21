import type { CSSProperties } from "react";

/** Percentage anchors inside the map frame — tuned for Natural Earth global + Europe views. */

export type MapRegionAnchor = Readonly<{
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  maxWidth: string;
  minWidth?: string;
}>;

/** Global overview — groups sit over their continent landmasses. */
export const GLOBAL_REGION_ANCHORS: Record<
  "americas" | "europe" | "apac",
  MapRegionAnchor
> = {
  americas: {
    top: "20%",
    left: "1.5%",
    maxWidth: "min(27%, 11.5rem)",
  },
  europe: {
    top: "4%",
    left: "43%",
    maxWidth: "min(27%, 11.5rem)",
  },
  apac: {
    top: "14%",
    right: "1.5%",
    maxWidth: "min(27%, 12rem)",
  },
};

/** Lower-left global index label — separate from Americas/Europe/APAC columns. */
export const GLOBAL_LEFT_REGION_ANCHOR: MapRegionAnchor = {
  bottom: "4%",
  left: "1.5%",
  maxWidth: "min(27%, 11.5rem)",
};

/**
 * Europe drilldown — three regional clusters near their geography on the focused map.
 * Tuned for bbox-fitted Mercator (Europe fills frame).
 */
export const EUROPE_DRILLDOWN_CLUSTER_ANCHORS: Record<
  "western" | "southern" | "nordics",
  MapRegionAnchor
> = {
  /** Top-right — Scandinavia */
  nordics: {
    top: "5%",
    right: "1.5%",
    maxWidth: "min(36%, 15.5rem)",
    minWidth: "min(32%, 11rem)",
  },
  /** Left-centre — UK / Benelux / France / Germany / CH */
  western: {
    top: "34%",
    left: "1.5%",
    maxWidth: "min(36%, 15.5rem)",
    minWidth: "min(32%, 11rem)",
  },
  /** Lower-centre — Iberia / Italy */
  southern: {
    bottom: "5%",
    left: "34%",
    maxWidth: "min(34%, 14.5rem)",
    minWidth: "min(30%, 10.5rem)",
  },
};

export function regionAnchorStyle(anchor: MapRegionAnchor): CSSProperties {
  return {
    top: anchor.top,
    left: anchor.left,
    right: anchor.right,
    bottom: anchor.bottom,
    maxWidth: anchor.maxWidth,
    minWidth: anchor.minWidth,
  };
}
