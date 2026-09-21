import type { GeoProjection } from "d3-geo";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/equities/equityMapStyle";
import { GLOBAL_GEO_ANCHORED_COUNTRY_IDS } from "@/lib/equities/equityMapViews";

/** Lon/lat anchor + pixel offset — projected through the live global map. */
export type GlobalCardGeoAnchor = Readonly<{
  countryId: string;
  coordinates: readonly [number, number];
  offsetX?: number;
  offsetY?: number;
}>;

/** Geo-anchored chips on the global world map (outside overlay columns). */
export const GLOBAL_CARD_GEO_ANCHORS: readonly GlobalCardGeoAnchor[] = [
  { countryId: "AU", coordinates: [133, -27], offsetX: -58, offsetY: 6 },
  { countryId: "ZA", coordinates: [25, -29], offsetX: 0, offsetY: -10 },
];

export type GlobalCardScreenPosition = Readonly<{
  countryId: string;
  left: string;
  top: string;
}>;

/** Project global geo anchors through the world map projection → overlay %. */
export function projectGlobalCardPositions(
  projection: GeoProjection,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): readonly GlobalCardScreenPosition[] {
  const anchorById = new Map(GLOBAL_CARD_GEO_ANCHORS.map((a) => [a.countryId, a]));

  return GLOBAL_GEO_ANCHORED_COUNTRY_IDS.flatMap((countryId) => {
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
