import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { carryToneClass, formatCarryBps, type FxCarry } from "@/lib/fx/carry";
import { FX_PAIRS, type FxPairId } from "@/lib/fx/pairs";
import type { FxLiveRow } from "@/lib/fx/types";
import { FxPairFlags } from "@/components/fx/FxPairFlags";

function fmtRate(n: number | null, digits: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtChange(n: number | null, digits: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function FxLiveRatesTable({
  rowsById,
  pendingIds,
  selectedPairId,
  onSelect,
  carryById,
  carryPending,
}: {
  rowsById: Partial<Record<FxPairId, FxLiveRow>>;
  pendingIds: ReadonlySet<FxPairId>;
  selectedPairId: FxPairId;
  onSelect: (id: FxPairId) => void;
  carryById: Partial<Record<FxPairId, FxCarry>>;
  carryPending: boolean;
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Pair</th>
              <th className="px-2 py-2 font-semibold">Rate</th>
              <th
                className="px-2 py-2 font-semibold text-right"
                title="Policy rate of the base currency minus the quote currency. Range targets (Fed funds) use the midpoint."
              >
                Carry (bps)
              </th>
              <th className="px-2 py-2 font-semibold">Change (1D)</th>
              <th className="px-4 py-2 font-semibold text-right">Change (1D %)</th>
            </tr>
          </thead>
          <tbody>
            {FX_PAIRS.map((pair) => {
              const row = rowsById[pair.id];
              const pending = pendingIds.has(pair.id);
              const selected = pair.id === selectedPairId;
              const carry = carryById[pair.id];
              return (
                <tr
                  key={pair.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(pair.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(pair.id);
                    }
                  }}
                  className={[
                    "cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30",
                    selected ? "bg-muted/40" : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <FxPairFlags pair={pair} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{pair.label}</div>
                        {row?.error ? (
                          <div className="mt-0.5 text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                            {row.error}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 font-medium tabular-nums text-foreground">
                    {pending && !row ? "…" : fmtRate(row?.rate ?? null, pair.digits)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${carryToneClass(carry?.bps ?? null)}`}
                    title={carry?.detail ?? undefined}
                  >
                    {carryPending && !carry ? "…" : formatCarryBps(carry?.bps ?? null)}
                  </td>
                  <td className={`px-2 py-2 tabular-nums ${changePctClass(row?.change1dPct ?? null)}`}>
                    {pending && !row ? "…" : fmtChange(row?.change1d ?? null, pair.digits)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${changePctClass(row?.change1dPct ?? null)}`}>
                    {pending && !row ? "…" : fmtPct(row?.change1dPct ?? null)}
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
