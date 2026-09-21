import { useMemo } from "react";
import type { GeoProjection } from "d3-geo";
import { EquityMarketCard } from "@/components/equities/EquityMarketCard";
import { projectEuropeCardPositions } from "@/lib/equities/equityEuropeCardGeo";
import { EUROPE_DETAIL_COUNTRY_IDS } from "@/lib/equities/equityMapViews";
import type { EquityMarketRow } from "@/lib/equities/types";

/** Avanza-style — one geo-anchored chip per tracked market on the Europe map. */
export function EquityEuropeOverlayClusters({
  projection,
  chipGrowScale,
  rowsById,
  selectedCountryId,
  onSelectCountry,
}: {
  projection: GeoProjection;
  /** 1 = original design size; >1 grows chips after 50% viewport. */
  chipGrowScale: number;
  rowsById: Map<string, EquityMarketRow>;
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
}) {
  const positions = useMemo(
    () => projectEuropeCardPositions(projection),
    [projection],
  );

  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.countryId, position])),
    [positions],
  );

  const scale = chipGrowScale > 0 ? chipGrowScale : 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {EUROPE_DETAIL_COUNTRY_IDS.map((countryId, index) => {
        const row = rowsById.get(countryId);
        const position = positionById.get(countryId);
        if (!row || !position) return null;

        return (
          <div
            key={countryId}
            className="pointer-events-auto absolute"
            style={{
              left: position.left,
              top: position.top,
              zIndex: 10 + index,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <EquityMarketCard
              row={row}
              europeDrilldown
              selected={selectedCountryId === countryId}
              onSelect={() => onSelectCountry(countryId)}
            />
          </div>
        );
      })}
    </div>
  );
}
