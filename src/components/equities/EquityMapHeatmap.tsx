import { useMemo, useState, useCallback, useRef } from "react";
import { geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import { useQuery } from "@tanstack/react-query";
import { EquityEuropeOverlayClusters } from "@/components/equities/EquityEuropeOverlayClusters";
import { EquityGlobalGeoClusters } from "@/components/equities/EquityGlobalGeoClusters";
import { EquityMapOverlayClusters } from "@/components/equities/EquityMapOverlayClusters";
import { EQUITY_MARKET_BY_ISO_NUMERIC } from "@/lib/equities/equityMarketsRegistry";
import {
  europeProjectionParams,
  globalProjectionParams,
  isEuropeViewRenderIso,
  isExcludedGlobalMapIso,
  naturalEarthProjection,
} from "@/lib/equities/equityMapProjection";
import type { EquityMapView } from "@/lib/equities/equityMapViews";
import { EUROPE_MARKET_COUNTRY_IDS, NON_GEO_MAP_MARKET_IDS } from "@/lib/equities/equityMapViews";
import {
  MAP_HEIGHT,
  MAP_PALETTE,
  MAP_WIDTH,
  mapLandFill,
} from "@/lib/equities/equityMapStyle";
import type { EquityMarketRow } from "@/lib/equities/types";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useViewportWidth } from "@/hooks/useViewportWidth";
import { europeChipGrowScale, globalMapLabelScale } from "@/lib/equities/equityEuropeChipScale";

const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function useWorldCountries() {
  return useQuery({
    queryKey: ["world-countries-topo"],
    queryFn: async () => {
      const res = await fetch(TOPO_URL);
      if (!res.ok) throw new Error("Failed to load map");
      return (await res.json()) as Topology;
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

function MapBreadcrumb({
  view,
  onGlobal,
}: {
  view: EquityMapView;
  onGlobal: () => void;
}) {
  if (view === "global") return null;

  return (
    <nav
      className="pointer-events-auto absolute left-2 top-1.5 z-20 flex items-center gap-1.5 text-[9px] sm:left-3 sm:top-2 sm:text-[10px]"
      aria-label="Map view"
    >
      <button
        type="button"
        className="font-medium transition-opacity hover:opacity-75"
        style={{ color: MAP_PALETTE.textSecondary }}
        onClick={onGlobal}
      >
        Global
      </button>
      <span style={{ color: MAP_PALETTE.textMuted }}>/</span>
      <span className="font-semibold" style={{ color: MAP_PALETTE.textPrimary }}>
        Europe
      </span>
    </nav>
  );
}

export function EquityMapHeatmap({
  rows,
  selectedCountryId,
  onSelectCountry,
  meta,
}: {
  rows: EquityMarketRow[];
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string | null) => void;
  meta?: React.ReactNode;
}) {
  const topoQuery = useWorldCountries();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<EquityMapView>("global");
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const mapFrameWidth = useElementWidth(mapFrameRef);
  const viewportWidth = useViewportWidth();
  const chipGrowScale = europeChipGrowScale(viewportWidth, mapFrameWidth);
  const globalLabelScale = globalMapLabelScale(mapFrameWidth, viewportWidth);

  const loading = topoQuery.isPending;
  const error = topoQuery.isError;

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.countryId, r])), [rows]);

  const countries = useMemo(() => {
    if (!topoQuery.data) return null;
    return feature(
      topoQuery.data,
      topoQuery.data.objects.countries as Parameters<typeof feature>[1],
    ) as FeatureCollection;
  }, [topoQuery.data]);

  const projection = useMemo(() => {
    if (!countries) {
      return naturalEarthProjection({
        scale: 180,
        translate: [MAP_WIDTH / 2, MAP_HEIGHT / 2],
      });
    }
    const params =
      view === "europe"
        ? europeProjectionParams(countries)
        : globalProjectionParams(countries);
    const proj = naturalEarthProjection(params);
    if (view === "europe") {
      proj.clipExtent([
        [0, 0],
        [MAP_WIDTH, MAP_HEIGHT],
      ]);
    }
    return proj;
  }, [countries, view]);

  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const paths = useMemo(() => {
    if (!countries) return [];
    return countries.features
      .map((f, index) => ({
        d: pathGen(f) ?? "",
        isoNumeric: String(f.id ?? ""),
        featureKey:
          f.id != null && String(f.id).length > 0 ? String(f.id) : `__orphan_${index}`,
      }))
      .filter(({ d, isoNumeric }) => {
        if (!d || isoNumeric.length === 0) return false;
        if (view === "europe") return isEuropeViewRenderIso(isoNumeric);
        return !isExcludedGlobalMapIso(isoNumeric);
      });
  }, [countries, pathGen, view]);

  const handleSelect = useCallback(
    (countryId: string) => {
      if (NON_GEO_MAP_MARKET_IDS.has(countryId)) setHoverId(null);
      onSelectCountry(countryId);
    },
    [onSelectCountry],
  );

  const openEuropeView = useCallback(() => setView("europe"), []);
  const backToGlobal = useCallback(() => setView("global"), []);

  const handleMapCountryClick = useCallback(
    (countryId: string) => {
      handleSelect(countryId);
      if (view === "global" && EUROPE_MARKET_COUNTRY_IDS.has(countryId)) {
        setView("europe");
      }
    },
    [handleSelect, view],
  );

  return (
    <div
      className="w-full overflow-hidden [container-type:inline-size]"
      style={{
        background: MAP_PALETTE.monitorBg,
        padding: "clamp(12px, 2cqi, 20px)",
      }}
    >
      <div
        ref={mapFrameRef}
        className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl"
        style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-xl"
          style={{ background: MAP_PALETTE.monitorBgDeep }}
        >
          {loading ? (
            <div
              className="absolute inset-0 flex items-center justify-center text-[13px]"
              style={{ color: MAP_PALETTE.textMuted }}
            >
              Loading map…
            </div>
          ) : error ? (
            <div
              className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px]"
              style={{ color: MAP_PALETTE.textMuted }}
            >
              Map unavailable
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              width="100%"
              height="100%"
              className="block h-full w-full max-w-full select-none"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={view === "europe" ? "Europe map" : "World map background"}
            >
              <g>
                {paths.map(({ d, isoNumeric, featureKey }) => {
                  const market = EQUITY_MARKET_BY_ISO_NUMERIC[isoNumeric];
                  const isSelected =
                    market != null &&
                    selectedCountryId != null &&
                    !NON_GEO_MAP_MARKET_IDS.has(selectedCountryId) &&
                    market.countryId === selectedCountryId;
                  const isHovered = market != null && market.countryId === hoverId;
                  const isEuropeView = view === "europe";

                  return (
                    <path
                      key={featureKey}
                      d={d}
                      fill={
                        isEuropeView && !isSelected && !isHovered
                          ? MAP_PALETTE.europeLand
                          : mapLandFill(isSelected, isHovered)
                      }
                      stroke={
                        isSelected
                          ? MAP_PALETTE.borderSelected
                          : isHovered
                            ? MAP_PALETTE.borderHover
                            : isEuropeView
                              ? MAP_PALETTE.europeBorder
                              : MAP_PALETTE.border
                      }
                      strokeWidth={
                        isSelected ? 0.55 : isHovered ? 0.44 : isEuropeView ? 0.38 : 0.28
                      }
                      className={market ? "cursor-pointer" : undefined}
                      onMouseEnter={() => market && setHoverId(market.countryId)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => market && handleMapCountryClick(market.countryId)}
                    />
                  );
                })}
              </g>
            </svg>
          )}
        </div>

        <MapBreadcrumb view={view} onGlobal={backToGlobal} />

        {view === "global" && meta ? (
          <p
            className="pointer-events-none absolute right-2 top-1.5 z-20 text-[9px] tabular-nums sm:right-3 sm:top-2 sm:text-[10px]"
            style={{ color: MAP_PALETTE.textMuted }}
          >
            {meta}
          </p>
        ) : null}

        {view === "europe" ? (
          <button
            type="button"
            className="pointer-events-auto absolute right-2 top-1.5 z-20 rounded-md border px-1.5 py-0.5 text-[9px] font-medium sm:right-3 sm:top-2 sm:px-2 sm:py-1 sm:text-[10px]"
            style={{
              borderColor: MAP_PALETTE.cardBorder,
              color: MAP_PALETTE.textSecondary,
              background: MAP_PALETTE.cardBg,
              boxShadow: MAP_PALETTE.cardShadow,
            }}
            onClick={backToGlobal}
          >
            ← Global overview
          </button>
        ) : null}

        {rows.length > 0 && view === "global" ? (
          <>
            <EquityMapOverlayClusters
              labelScale={globalLabelScale}
              rowsById={rowsById}
              selectedCountryId={selectedCountryId}
              onSelectCountry={handleSelect}
              onEuropeDrilldown={openEuropeView}
            />
            <EquityGlobalGeoClusters
              projection={projection}
              labelScale={globalLabelScale}
              rowsById={rowsById}
              selectedCountryId={selectedCountryId}
              onSelectCountry={handleSelect}
            />
          </>
        ) : null}

        {rows.length > 0 && view === "europe" ? (
          <EquityEuropeOverlayClusters
            projection={projection}
            chipGrowScale={chipGrowScale}
            rowsById={rowsById}
            selectedCountryId={selectedCountryId}
            onSelectCountry={handleSelect}
          />
        ) : null}
      </div>
    </div>
  );
}
