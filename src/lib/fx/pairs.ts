import type { PolicyBankId } from "@/lib/policyRates/types";

export const FX_PAIR_IDS = [
  "eurusd",
  "usdjpy",
  "gbpusd",
  "usdchf",
  "usdsek",
  "eursek",
  "noksek",
] as const;

export type FxPairId = (typeof FX_PAIR_IDS)[number];

export type FxPairDef = Readonly<{
  id: FxPairId;
  label: string;
  from: string;
  to: string;
  digits: number;
  baseBank: PolicyBankId;
  quoteBank: PolicyBankId;
}>;

export const FX_PAIRS: readonly FxPairDef[] = [
  { id: "eurusd", label: "EUR/USD", from: "EUR", to: "USD", digits: 4, baseBank: "ecb", quoteBank: "fed" },
  { id: "usdjpy", label: "USD/JPY", from: "USD", to: "JPY", digits: 3, baseBank: "fed", quoteBank: "boj" },
  { id: "gbpusd", label: "GBP/USD", from: "GBP", to: "USD", digits: 4, baseBank: "boe", quoteBank: "fed" },
  { id: "usdchf", label: "USD/CHF", from: "USD", to: "CHF", digits: 4, baseBank: "fed", quoteBank: "snb" },
  { id: "usdsek", label: "USD/SEK", from: "USD", to: "SEK", digits: 4, baseBank: "fed", quoteBank: "riksbank" },
  { id: "eursek", label: "EUR/SEK", from: "EUR", to: "SEK", digits: 4, baseBank: "ecb", quoteBank: "riksbank" },
  { id: "noksek", label: "NOK/SEK", from: "NOK", to: "SEK", digits: 4, baseBank: "norges", quoteBank: "riksbank" },
];

export const FX_CURRENCY_FLAG: Record<string, string> = {
  EUR: "EU",
  USD: "US",
  JPY: "JP",
  GBP: "GB",
  CHF: "CH",
  SEK: "SE",
  NOK: "NO",
};

export const DEFAULT_FX_PAIR: FxPairId = "eurusd";

export function getFxPair(id: string): FxPairDef | undefined {
  return FX_PAIRS.find((p) => p.id === id);
}

export function isFxPairId(id: string): id is FxPairId {
  return FX_PAIRS.some((p) => p.id === id);
}

/** Unique quote bases with batched quote currencies for Frankfurter `/latest` and range calls. */
export function fxQuoteGroups(): { base: string; symbols: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const pair of FX_PAIRS) {
    let set = map.get(pair.from);
    if (!set) {
      set = new Set();
      map.set(pair.from, set);
    }
    set.add(pair.to);
  }
  return [...map.entries()].map(([base, symbols]) => ({ base, symbols: [...symbols] }));
}
