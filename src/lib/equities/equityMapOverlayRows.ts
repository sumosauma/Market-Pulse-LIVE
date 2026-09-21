import type { GlobalOverviewCard } from "@/lib/equities/equityMapViews";
import type { EquityMarketRow } from "@/lib/equities/types";

function unavailableOverviewRow(
  config: GlobalOverviewCard,
): EquityMarketRow {
  return {
    countryId: config.id,
    countryName: config.countryName,
    iso2: "",
    iso3: "",
    isoNumeric: "",
    region: "Europe",
    indexName: config.indexName,
    ticker: "",
    source: "",
    isLive: false,
    price: null,
    changePercent: null,
    status: "unavailable",
    displayStatus: "Unavailable",
    error: "Not configured for live data",
  };
}

/** Build a display row for global map overview cards (UI labels only). */
export function globalOverviewRow(
  config: GlobalOverviewCard,
  rowsById: Map<string, EquityMarketRow>,
): EquityMarketRow {
  if (config.sourceCountryId) {
    const source = rowsById.get(config.sourceCountryId);
    if (!source) return unavailableOverviewRow(config);
    return {
      ...source,
      indexName: config.indexName,
      countryName: config.countryName,
    };
  }

  return unavailableOverviewRow(config);
}

/** @deprecated use globalOverviewRow */
export const globalEuropeOverviewRow = globalOverviewRow;
