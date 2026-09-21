import { useMemo } from "react";
import type { GeoProjection } from "d3-geo";
import { EquityMarketCard } from "@/components/equities/EquityMarketCard";
import { projectGlobalCardPositions } from "@/lib/equities/equityGlobalCardGeo";
import { GLOBAL_GEO_ANCHORED_COUNTRY_IDS } from "@/lib/equities/equityMapViews";
import type { EquityMarketRow } from "@/lib/equities/types";

/** Geo-anchored overlay cards on the global world map. */
export function EquityGlobalGeoClusters({
  projection,
  labelScale,
  rowsById,
  selectedCountryId,
  onSelectCountry,
}: {
  projection: GeoProjection;
  labelScale: number;
  rowsById: Map<string, EquityMarketRow>;
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
}) {
  const positions = useMemo(
    () => projectGlobalCardPositions(projection),
    [projection],
  );

  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.countryId, position])),
    [positions],
  );

  const scale = labelScale > 0 ? labelScale : 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {GLOBAL_GEO_ANCHORED_COUNTRY_IDS.map((countryId, index) => {
        const row = rowsById.get(countryId);
        const position = positionById.get(countryId);
        if (!row || !position) return null;

        return (
          <div
            key={countryId}
            className="pointer-events-auto absolute w-[min(10.5rem,27%)]"
            style={{
              left: position.left,
              top: position.top,
              zIndex: 15 + index,
              transform:
                scale < 0.999
                  ? `translate(-50%, -50%) scale(${scale})`
                  : "translate(-50%, -50%)",
            }}
          >
            <EquityMarketCard
              row={row}
              overlay
              selected={selectedCountryId === countryId}
              onSelect={() => onSelectCountry(countryId)}
            />
          </div>
        );
      })}
    </div>
  );
}
