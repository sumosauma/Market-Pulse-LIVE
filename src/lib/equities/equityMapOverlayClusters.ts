/** Three overlay columns inside the map canvas — Americas / Europe / Asia-Pacific. */

export type MapOverlayColumn = Readonly<{
  id: string;
  label: string;
  countryIds: readonly string[];
}>;

export const MAP_OVERLAY_COLUMNS: readonly MapOverlayColumn[] = [
  {
    id: "americas",
    label: "AMERICAS",
    countryIds: ["US", "CA", "MX", "BR"],
  },
  {
    id: "europe",
    label: "EUROPE",
    countryIds: [],
  },
  {
    id: "apac",
    label: "ASIA-PACIFIC",
    countryIds: ["JP", "CN", "HK", "IN", "KR"],
  },
];

/** @deprecated use MAP_OVERLAY_COLUMNS */
export const MAP_OVERLAY_CLUSTERS = MAP_OVERLAY_COLUMNS;

export const ALL_OVERLAY_COUNTRY_IDS: readonly string[] = MAP_OVERLAY_COLUMNS.flatMap(
  (c) => c.countryIds,
);
