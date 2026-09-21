/** Fixed regional card groups for the global market monitor — not geographic placement. */

export type MarketCardGroup = Readonly<{
  label: string;
  countryIds: readonly string[];
}>;

export const GLOBAL_MARKET_CARD_GROUPS: readonly MarketCardGroup[] = [
  {
    label: "Americas",
    countryIds: ["US", "CA", "MX", "BR"],
  },
  {
    label: "Europe",
    countryIds: ["SE", "NO", "DK", "FI", "GB", "DE", "FR", "IT", "ES", "NL", "CH"],
  },
  {
    label: "Asia-Pacific",
    countryIds: ["JP", "CN", "HK", "IN", "KR", "AU", "ZA"],
  },
];

export const ALL_MARKET_CARD_IDS: readonly string[] = GLOBAL_MARKET_CARD_GROUPS.flatMap(
  (g) => g.countryIds,
);
