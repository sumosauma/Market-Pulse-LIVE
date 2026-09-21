import { useMemo, useState, type ReactNode } from "react";
import { fmtChangePct, fmtEquityPrice } from "@/lib/equities/equityMarketsUi";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { change1mPercent, changeOverTradingDays } from "@/lib/equities/equityDayChange";
import type { EquityMarketRow } from "@/lib/equities/types";

type SortField = "1D" | "5D" | "1M" | "1Y";
type SortDirection = "desc" | "asc";
type GroupFilter = "all" | "americas" | "europe" | "asia_pacific" | "global";

const SORT_FIELDS: readonly SortField[] = ["1D", "5D", "1M", "1Y"];

const GROUP_FILTER_OPTIONS: readonly { id: GroupFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "americas", label: "Americas" },
  { id: "europe", label: "Europe" },
  { id: "asia_pacific", label: "Asia-Pacific" },
  { id: "global", label: "Global indexes" },
];

/** Explicit countryId sets — do not infer from region (EU500/OMXN40 are Global, ZA is Asia-Pacific). */
const GROUP_COUNTRY_IDS: Record<Exclude<GroupFilter, "all">, ReadonlySet<string>> = {
  americas: new Set(["US", "CA", "MX", "BR"]),
  europe: new Set(["SE", "NO", "DK", "FI", "GB", "DE", "FR", "NL", "CH", "IT", "ES"]),
  asia_pacific: new Set(["JP", "CN", "HK", "IN", "KR", "AU", "ZA"]),
  global: new Set(["nqgi", "eu500", "omxn40"]),
};

function filterRowsByGroup(rows: EquityMarketRow[], groupFilter: GroupFilter): EquityMarketRow[] {
  if (groupFilter === "all") return rows;
  const allowed = GROUP_COUNTRY_IDS[groupFilter];
  return rows.filter((row) => allowed.has(row.countryId));
}

function sortValueForField(row: EquityMarketRow, field: SortField): number | null {
  switch (field) {
    case "1D":
      return row.changePercent;
    case "5D":
      return changeOverTradingDays(row, 5);
    case "1M":
      return change1mPercent(row);
    case "1Y": {
      const history = row.history ?? [];
      if (history.length < 22) return null;
      return changeOverTradingDays(row, Math.min(252, history.length - 1));
    }
  }
}

function compareSortRows(
  a: EquityMarketRow,
  b: EquityMarketRow,
  field: SortField,
  direction: SortDirection,
): number {
  const aVal = sortValueForField(a, field);
  const bVal = sortValueForField(b, field);
  const aUnavailable = aVal === null || !Number.isFinite(aVal);
  const bUnavailable = bVal === null || !Number.isFinite(bVal);

  if (aUnavailable && bUnavailable) return 0;
  if (aUnavailable) return 1;
  if (bUnavailable) return -1;

  const diff = aVal - bVal;
  return direction === "desc" ? -diff : diff;
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-muted/50 text-foreground ring-1 ring-border/50"
          : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function EquityIndexTable({
  rows,
  selectedCountryId,
  onSelectCountry,
}: {
  rows: EquityMarketRow[];
  selectedCountryId: string | null;
  onSelectCountry: (countryId: string) => void;
}) {
  const [sortField, setSortField] = useState<SortField>("1D");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  const sorted = useMemo(() => {
    const filtered = filterRowsByGroup(rows, groupFilter);
    return [...filtered].sort((a, b) => compareSortRows(a, b, sortField, sortDirection));
  }, [rows, groupFilter, sortField, sortDirection]);

  if (!rows.length) {
    return (
      <div className="px-4 py-6 text-[13px] text-muted-foreground">No market rows available.</div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Show
          </span>
          {GROUP_FILTER_OPTIONS.map(({ id, label }) => (
            <SortChip key={id} active={groupFilter === id} onClick={() => setGroupFilter(id)}>
              {label}
            </SortChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Sort by
          </span>
          {SORT_FIELDS.map((field) => (
            <SortChip key={field} active={sortField === field} onClick={() => setSortField(field)}>
              {field}
            </SortChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Order
          </span>
          <SortChip
            active={sortDirection === "desc"}
            onClick={() => setSortDirection("desc")}
          >
            Highest to lowest
          </SortChip>
          <SortChip active={sortDirection === "asc"} onClick={() => setSortDirection("asc")}>
            Lowest to highest
          </SortChip>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[24%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Country</th>
              <th className="px-4 py-2.5 font-semibold">Index</th>
              <th className="px-4 py-2.5 text-right font-semibold">Last</th>
              <th className="px-4 py-2.5 text-right font-semibold">Performance ({sortField})</th>
              <th className="px-4 py-2.5 font-semibold">Region</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const selected = row.countryId === selectedCountryId;
              const performance = sortValueForField(row, sortField);
              return (
                <tr
                  key={row.countryId}
                  className={[
                    "cursor-pointer border-b border-border/40 last:border-0 transition-colors",
                    selected ? "bg-accent/40" : "hover:bg-accent/25",
                  ].join(" ")}
                  onClick={() => onSelectCountry(row.countryId)}
                >
                  <td className="overflow-hidden px-4 py-2.5 text-[12px] font-medium text-foreground">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                      <EquityCountryFlag countryId={row.countryId} size="sm" />
                      <span className="truncate">{row.countryName}</span>
                    </span>
                  </td>
                  <td className="overflow-hidden px-4 py-2.5 text-[12px] text-muted-foreground">
                    <span className="block truncate">{row.indexName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                    {fmtEquityPrice(row.price)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums ${changePctClass(performance)}`}
                  >
                    {fmtChangePct(performance)}
                  </td>
                  <td className="overflow-hidden px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="block truncate">{row.region}</span>
                  </td>
                  <td className="overflow-hidden px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="block truncate">{row.displayStatus}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
