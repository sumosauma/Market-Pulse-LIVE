import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { FX_CURRENCY_FLAG, type FxPairDef } from "@/lib/fx/pairs";

const OVERLAP = {
  xs: "-ml-1",
  sm: "-ml-1.5",
  md: "-ml-2",
  lg: "-ml-2.5",
  xl: "-ml-4",
} as const;

export function FxCurrencyFlag({
  currency,
  size = "xs",
}: {
  currency: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const countryId = FX_CURRENCY_FLAG[currency];
  if (!countryId) return null;
  return <EquityCountryFlag countryId={countryId} size={size} />;
}

export function FxPairFlags({
  pair,
  size = "sm",
}: {
  pair: FxPairDef;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const base = FX_CURRENCY_FLAG[pair.from];
  const quote = FX_CURRENCY_FLAG[pair.to];
  if (!base || !quote) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center"
      title={`${pair.from} / ${pair.to}`}
      aria-hidden
    >
      <span className="relative z-[1]">
        <EquityCountryFlag countryId={base} size={size} />
      </span>
      <span className={`relative z-[2] ${OVERLAP[size]}`}>
        <EquityCountryFlag countryId={quote} size={size} />
      </span>
    </span>
  );
}
