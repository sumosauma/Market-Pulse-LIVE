import { EquityMapRegionGroup } from "@/components/equities/EquityMapRegionGroup";
import { EquityMarketCard } from "@/components/equities/EquityMarketCard";
import { MAP_OVERLAY_COLUMNS } from "@/lib/equities/equityMapOverlayClusters";
import {
  GLOBAL_LEFT_REGION_ANCHOR,
  GLOBAL_REGION_ANCHORS,
} from "@/lib/equities/equityMapOverlayLayout";
import { globalOverviewRow } from "@/lib/equities/equityMapOverlayRows";
import {
  GLOBAL_EUROPE_OVERVIEW_CARDS,
  GLOBAL_LEFT_OVERVIEW_CARDS,
} from "@/lib/equities/equityMapViews";
import type { EquityMarketRow } from "@/lib/equities/types";

function MarketColumn({
  column,
  labelScale,
  rowsById,
  selectedCountryId,
  onSelectCountry,
  onEuropeDrilldown,
}: {
  column: (typeof MAP_OVERLAY_COLUMNS)[number];
  labelScale: number;
  rowsById: Map<string, EquityMarketRow>;
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
  onEuropeDrilldown?: () => void;
}) {
  const isEurope = column.id === "europe";
  const anchor = GLOBAL_REGION_ANCHORS[column.id as keyof typeof GLOBAL_REGION_ANCHORS];

  return (
    <EquityMapRegionGroup
      anchor={anchor}
      label={column.label}
      drilldown={isEurope}
      chipGrowScale={labelScale}
      onDrilldown={isEurope ? onEuropeDrilldown : undefined}
    >
      {isEurope
        ? GLOBAL_EUROPE_OVERVIEW_CARDS.map((config) => {
            const row = globalOverviewRow(config, rowsById);
            return (
              <EquityMarketCard
                key={config.id}
                row={row}
                overlay
                selected={
                  config.sourceCountryId
                    ? selectedCountryId === config.sourceCountryId
                    : false
                }
                onSelect={() => {
                  if (config.sourceCountryId) onSelectCountry(config.sourceCountryId);
                }}
              />
            );
          })
        : column.countryIds.map((countryId) => {
            const row = rowsById.get(countryId);
            if (!row) return null;
            return (
              <EquityMarketCard
                key={countryId}
                row={row}
                overlay
                selected={selectedCountryId === countryId}
                onSelect={() => onSelectCountry(countryId)}
              />
            );
          })}
    </EquityMapRegionGroup>
  );
}

/** Continent-anchored overlay groups inside the global map canvas. */
export function EquityMapOverlayClusters({
  labelScale,
  rowsById,
  selectedCountryId,
  onSelectCountry,
  onEuropeDrilldown,
}: {
  labelScale: number;
  rowsById: Map<string, EquityMarketRow>;
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
  onEuropeDrilldown?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {MAP_OVERLAY_COLUMNS.map((column) => (
        <MarketColumn
          key={column.id}
          column={column}
          labelScale={labelScale}
          rowsById={rowsById}
          selectedCountryId={selectedCountryId}
          onSelectCountry={onSelectCountry}
          onEuropeDrilldown={column.id === "europe" ? onEuropeDrilldown : undefined}
        />
      ))}

      <EquityMapRegionGroup
        anchor={GLOBAL_LEFT_REGION_ANCHOR}
        label="GLOBAL"
        chipGrowScale={labelScale}
      >
        {GLOBAL_LEFT_OVERVIEW_CARDS.map((config) => {
          const row = globalOverviewRow(config, rowsById);
          return (
            <EquityMarketCard
              key={config.id}
              row={row}
              overlay
              selected={
                config.sourceCountryId ? selectedCountryId === config.sourceCountryId : false
              }
              onSelect={() => {
                if (config.sourceCountryId) onSelectCountry(config.sourceCountryId);
              }}
            />
          );
        })}
      </EquityMapRegionGroup>
    </div>
  );
}
