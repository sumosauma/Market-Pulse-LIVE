/** Short map-chip labels for Europe drilldown — full index name stays in tooltip/registry. */
export const EUROPE_CHIP_LABELS: Readonly<Record<string, string>> = {
  FI: "FI",
  NO: "OBX",
  SE: "OMXS30",
  DK: "DK",
  GB: "FTSE",
  DE: "DAX",
  FR: "CAC",
  NL: "AEX",
  CH: "SMI",
  IT: "MIB",
  ES: "IBEX",
};

export function europeChipLabel(countryId: string, indexName: string): string {
  return EUROPE_CHIP_LABELS[countryId] ?? indexName;
}

/** Compact % for map chips — fixed width friendly. */
export function fmtEuropeChipPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
