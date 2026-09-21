import type { GeoProjection } from "d3-geo";
import { EUROPE_DETAIL_COUNTRY_IDS } from "@/lib/equities/equityMapViews";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/equities/equityMapStyle";

/** Lon/lat anchor + pixel offset — projected through the live Europe map. */
export type EuropeCardGeoAnchor = Readonly<{
  countryId: string;
  coordinates: readonly [number, number];
  offsetX?: number;
  offsetY?: number;
}>;

/**
 * LOCKED — final Europe drilldown chip layout (May 2026).
 * Do not auto-adjust; change offsets here only for intentional design tweaks.
 */
export const EUROPE_CARD_GEO_ANCHORS: readonly EuropeCardGeoAnchor[] = [
  { countryId: "FI", coordinates: [26, 64], offsetX: 0, offsetY: 0 },
  { countryId: "NO", coordinates: [9, 62], offsetX: -12, offsetY: 0 },
  { countryId: "SE", coordinates: [15, 62], offsetX: 10, offsetY: 44 },
  { countryId: "DK", coordinates: [9.5, 56], offsetX: -5, offsetY: 2 },
  { countryId: "GB", coordinates: [-2, 54], offsetX: 0, offsetY: 0 },
  { countryId: "DE", coordinates: [11, 51], offsetX: 6, offsetY: 22 },
  { countryId: "FR", coordinates: [2, 47], offsetX: 0, offsetY: 32 },
  { countryId: "NL", coordinates: [5.4, 52.15], offsetX: 0, offsetY: 0 },
  { countryId: "CH", coordinates: [8.2, 47], offsetX: 0, offsetY: -6 },
  { countryId: "ES", coordinates: [-3.7, 40], offsetX: 0, offsetY: -14 },
  { countryId: "IT", coordinates: [12.5, 42.5], offsetX: 0, offsetY: 0 },
];

export type EuropeCardScreenPosition = Readonly<{
  countryId: string;
  left: string;
  top: string;
}>;

/** Project locked geo anchors through the Europe map projection → overlay %. */
export function projectEuropeCardPositions(
  projection: GeoProjection,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): readonly EuropeCardScreenPosition[] {
  const anchorById = new Map(EUROPE_CARD_GEO_ANCHORS.map((a) => [a.countryId, a]));

  return EUROPE_DETAIL_COUNTRY_IDS.flatMap((countryId) => {
    const anchor = anchorById.get(countryId);
    if (!anchor) return [];

    const point = projection(anchor.coordinates as [number, number]);
    if (!point) return [];

    const x = point[0] + (anchor.offsetX ?? 0);
    const y = point[1] + (anchor.offsetY ?? 0);

    return [
      {
        countryId,
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
      },
    ];
  });
}
