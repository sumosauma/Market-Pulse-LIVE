import { useMemo } from "react";
import { EquityMarketCard } from "@/components/equities/EquityMarketCard";
import { GLOBAL_MARKET_CARD_GROUPS } from "@/lib/equities/equityMapCardGroups";
import type { EquityMarketRow } from "@/lib/equities/types";

const GROUP_TITLE =
  "mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

export function EquityMarketCardGrid({
  rows,
  selectedCountryId,
  onSelectCountry,
  meta,
}: {
  rows: EquityMarketRow[];
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
  meta?: React.ReactNode;
}) {
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.countryId, r])), [rows]);

  if (!rows.length) {
    return (
      <div className="p-4 text-[13px] text-muted-foreground">
        No market rows available.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <header className="mb-3 shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            Market monitor
          </h2>
          {meta ? <p className="text-[10px] tabular-nums text-muted-foreground">{meta}</p> : null}
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {GLOBAL_MARKET_CARD_GROUPS.map((group) => (
          <section key={group.label} className="min-w-0">
            <h3 className={GROUP_TITLE}>{group.label}</h3>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {group.countryIds.map((countryId) => {
                const row = rowsById.get(countryId);
                if (!row) return null;
                return (
                  <EquityMarketCard
                    key={countryId}
                    row={row}
                    selected={selectedCountryId === countryId}
                    onSelect={() => onSelectCountry(countryId)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
