import {
  geoNaturalEarth1,
  geoPath,
  type GeoPath,
  type GeoProjection,
} from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import {
  EUROPE_REGION_BBOX,
  EUROPE_VIEW_FIT_ISO_SET,
  EUROPE_VIEW_RENDER_ISO_SET,
} from "./equityMapViews";
import { MAP_HEIGHT, MAP_WIDTH } from "./equityMapStyle";

export type MapProjectionParams = Readonly<{
  scale: number;
  translate: [number, number];
}>;

export const EUROPE_MAP_FIT_PADDING_PX = 6;

/** ISO 3166-1 numeric — world-atlas@2 (Greenland, Antarctica). */
export const GLOBAL_MAP_EXCLUDED_ISO_NUMERIC = ["304", "010"] as const;

const GLOBAL_MAP_EXCLUDED_ISO_SET = new Set<string>(GLOBAL_MAP_EXCLUDED_ISO_NUMERIC);

export const GLOBAL_MAP_FIT_PADDING_PX = 4;

/** Extra zoom after fitExtent — market continents fill the frame. */
const GLOBAL_EXTRA_ZOOM = 1.28;

function globalFeatureName(properties: GeoJsonProperties | null | undefined): string | null {
  if (!properties || typeof properties.name !== "string") return null;
  return properties.name;
}

/** Greenland and Antarctica — excluded from global render and projection fit. */
export function isExcludedGlobalMapFeature(feature: Feature): boolean {
  const isoNumeric = String(feature.id ?? "");
  if (GLOBAL_MAP_EXCLUDED_ISO_SET.has(isoNumeric)) return true;

  const name = globalFeatureName(feature.properties);
  return name === "Greenland" || name === "Antarctica";
}

export function isExcludedGlobalMapIso(isoNumeric: string): boolean {
  return GLOBAL_MAP_EXCLUDED_ISO_SET.has(isoNumeric);
}

function filterGlobalMapFeatures(countries: FeatureCollection): FeatureCollection {
  const features = countries.features.filter((f) => !isExcludedGlobalMapFeature(f));
  return { type: "FeatureCollection", features };
}

export const EUROPE_VISUAL_CENTER: [number, number] = [13, 53];

const EUROPE_LAND_WIDTH_RATIO = 0.98;
const EUROPE_LAND_HEIGHT_RATIO = 2.25;
/** Extra zoom after framing — spreads geo-anchored chips in dense areas. */
const EUROPE_EXTRA_ZOOM = 1.18;

const EUROPE_REGION_BBOX_FEATURE: Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [EUROPE_REGION_BBOX.west, EUROPE_REGION_BBOX.south],
        [EUROPE_REGION_BBOX.east, EUROPE_REGION_BBOX.south],
        [EUROPE_REGION_BBOX.east, EUROPE_REGION_BBOX.north],
        [EUROPE_REGION_BBOX.west, EUROPE_REGION_BBOX.north],
        [EUROPE_REGION_BBOX.west, EUROPE_REGION_BBOX.south],
      ],
    ],
  },
};

const EUROPE_REGION_BBOX_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [EUROPE_REGION_BBOX_FEATURE],
};

function filterEuropeMapFeatures(countries: FeatureCollection): FeatureCollection {
  const features = countries.features.filter((f) =>
    EUROPE_VIEW_RENDER_ISO_SET.has(String(f.id ?? "")),
  );
  return { type: "FeatureCollection", features };
}

function filterEuropeFitFeatures(countries: FeatureCollection): FeatureCollection {
  const features = countries.features.filter((f) =>
    EUROPE_VIEW_FIT_ISO_SET.has(String(f.id ?? "")),
  );
  return { type: "FeatureCollection", features };
}

function landPixelBounds(
  path: GeoPath,
  features: FeatureCollection,
): Readonly<{
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}> {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const f of features.features) {
    const [[bx0, by0], [bx1, by1]] = path.bounds(f);
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
  }

  return {
    x0,
    y0,
    x1,
    y1,
    width: x1 - x0,
    height: y1 - y0,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
}

function fitProjectionToFeatures(
  projection: GeoProjection,
  countries: FeatureCollection,
  width: number,
  height: number,
  pad: number,
): MapProjectionParams {
  projection.fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    countries,
  );
  return {
    scale: projection.scale(),
    translate: projection.translate() as [number, number],
  };
}

function boostProjectionToLandFill(
  projection: GeoProjection,
  features: FeatureCollection,
  width: number,
  height: number,
  pad: number,
): void {
  const path = geoPath(projection);
  const land = landPixelBounds(path, features);
  if (!Number.isFinite(land.width) || land.width <= 0) return;

  const availW = width - 2 * pad;
  const availH = height - 2 * pad;
  const boostW = (availW * EUROPE_LAND_WIDTH_RATIO) / land.width;
  const boostH = (availH * EUROPE_LAND_HEIGHT_RATIO) / land.height;
  const boost = Math.min(boostW, boostH);
  if (boost <= 1.01) return;

  const [tx, ty] = projection.translate();
  const scale = projection.scale();
  projection
    .scale(scale * boost)
    .translate([
      land.cx - boost * (land.cx - tx),
      land.cy - boost * (land.cy - ty),
    ]);
}

function centerOnVisualAnchor(
  projection: GeoProjection,
  width: number,
  height: number,
  anchor: [number, number] = EUROPE_VISUAL_CENTER,
): void {
  const point = projection(anchor);
  if (!point) return;

  const [px, py] = point;
  const [tx, ty] = projection.translate();
  projection.translate([tx + width / 2 - px, ty + height / 2 - py]);
}

function applyExtraZoom(
  projection: GeoProjection,
  width: number,
  height: number,
  factor: number,
): void {
  if (factor <= 1.001) return;

  const [tx, ty] = projection.translate();
  const scale = projection.scale();
  projection
    .scale(scale * factor)
    .translate([
      width / 2 - factor * (width / 2 - tx),
      height / 2 - factor * (height / 2 - ty),
    ]);
}

export function globalProjectionParams(
  countries: FeatureCollection,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
  pad = GLOBAL_MAP_FIT_PADDING_PX,
): MapProjectionParams {
  const filtered = filterGlobalMapFeatures(countries);
  const fitTarget =
    filtered.features.length > 0 ? filtered : countries;

  const projection = geoNaturalEarth1();
  projection.fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    fitTarget,
  );
  applyExtraZoom(projection, width, height, GLOBAL_EXTRA_ZOOM);

  return {
    scale: projection.scale(),
    translate: projection.translate() as [number, number],
  };
}

/**
 * Europe drilldown — fit/zoom to market Europe; render includes western Russia.
 * Russia is drawn for the right rim but excluded from fit (spans to the Pacific).
 */
export function europeProjectionParams(
  countries: FeatureCollection,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
  pad = EUROPE_MAP_FIT_PADDING_PX,
): MapProjectionParams {
  const fitFeatures = filterEuropeFitFeatures(countries);
  const fitTarget =
    fitFeatures.features.length >= 3 ? fitFeatures : EUROPE_REGION_BBOX_COLLECTION;

  const projection = geoNaturalEarth1();
  projection.fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    fitTarget,
  );

  if (fitTarget !== EUROPE_REGION_BBOX_COLLECTION) {
    boostProjectionToLandFill(projection, fitFeatures, width, height, pad);
    centerOnVisualAnchor(projection, width, height);
    applyExtraZoom(projection, width, height, EUROPE_EXTRA_ZOOM);
  }

  return {
    scale: projection.scale(),
    translate: projection.translate() as [number, number],
  };
}

export function naturalEarthProjection(params: MapProjectionParams) {
  return geoNaturalEarth1().scale(params.scale).translate(params.translate);
}

export function isEuropeViewRenderIso(isoNumeric: string): boolean {
  return EUROPE_VIEW_RENDER_ISO_SET.has(isoNumeric);
}

/** @deprecated use isEuropeViewRenderIso */
export function isEuropeMapIso(isoNumeric: string): boolean {
  return isEuropeViewRenderIso(isoNumeric);
}
