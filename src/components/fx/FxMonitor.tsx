import { useMemo, useState } from "react";
import { PercentileScale } from "@/components/derivatives/PercentileScale";
import { Panel } from "@/components/PageShell";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { carryForPair, carryToneClass, formatIndicativeCarry, formatPolicyDiff } from "@/lib/fx/carry";
import { FX_DESK_PERIODS, latestClose, pairSeries, returnOverSessions, volatilitySnapshot, type FxDeskMarket, type FxDeskPeriod } from "@/lib/fx/desk";
import { FX_PAIRS, type FxPairId } from "@/lib/fx/pairs";
import type { PolicyBankId, PolicyRateRow } from "@/lib/policyRates/types";
import { fmtPct, fmtRate, fmtVol } from "./fxFormat";
import { FxInfo, FxSectionStatus } from "./FxSection";

const PERIOD_SESSIONS: Record<FxDeskPeriod, number> = { "1D": 1, "1W": 5, "1M": 21, "3M": 63 };

type SortKey = "pair" | "spot" | FxDeskPeriod | "policy" | "carry" | "rv";

export function FxMonitor({
  market,
  loading,
  failed,
  policyByBank,
  policyPending,
  selectedPairId,
  onSelect,
}: {
  market: FxDeskMarket | undefined;
  loading: boolean;
  failed: boolean;
  policyByBank: ReadonlyMap<PolicyBankId, PolicyRateRow>;
  policyPending: boolean;
  selectedPairId: FxPairId;
  onSelect: (id: FxPairId) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("pair");
  const [sortDesc, setSortDesc] = useState(false);

  const rows = useMemo(() => {
    return FX_PAIRS.map((pair, index) => {
      const series = market ? pairSeries(pair.from, pair.to, market.usdQuotes) : [];
      const returns = {} as Record<FxDeskPeriod, number | null>;
      for (const period of FX_DESK_PERIODS) {
        returns[period] = series.length ? returnOverSessions(series, PERIOD_SESSIONS[period]) : null;
      }
      const carry = policyPending || !market ? null : carryForPair(pair, policyByBank).bps;
      let rv20: number | null = null;
      let rvPercentile: number | null = null;
      if (series.length) {
        try {
          const vol = volatilitySnapshot(series);
          rv20 = vol.rv20;
          rvPercentile = vol.percentile1y;
        } catch {
          rv20 = null;
          rvPercentile = null;
        }
      }
      return { pair, index, spot: series.length ? latestClose(series) : null, returns, carry, rv20, rvPercentile };
    });
  }, [market, policyByBank, policyPending]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDesc ? -1 : 1;
    copy.sort((a, b) => {
      if (sortKey === "pair") return (a.index - b.index) * dir;
      const av = sortKey === "spot" ? a.spot : sortKey === "rv" ? a.rv20 : sortKey === "policy" || sortKey === "carry" ? a.carry : a.returns[sortKey];
      const bv = sortKey === "spot" ? b.spot : sortKey === "rv" ? b.rv20 : sortKey === "policy" || sortKey === "carry" ? b.carry : b.returns[sortKey];
      if (av == null && bv == null) return a.index - b.index;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return copy;
  }, [rows, sortDesc, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((value) => !value);
    else {
      setSortKey(key);
      setSortDesc(key !== "pair");
    }
  }

  return (
    <Panel title="FX Monitor" meta="Spot, pair returns, policy differential, carry and 20-day realized volatility">
      {loading ? (
        <FxSectionStatus label="Loading FX monitor" />
      ) : failed || !market ? (
        <FxSectionStatus message="FX history is unavailable." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <SortHead label="Pair" align="left" active={sortKey === "pair"} onClick={() => toggleSort("pair")} />
                <SortHead label="Spot" active={sortKey === "spot"} onClick={() => toggleSort("spot")} />
                {FX_DESK_PERIODS.map((period) => (
                  <SortHead key={period} label={period} active={sortKey === period} onClick={() => toggleSort(period)} />
                ))}
                <th className="px-2 py-2 font-semibold">
                  <span className="inline-flex items-center justify-end gap-1">
                    <button type="button" onClick={() => toggleSort("rv")} className={sortKey === "rv" ? "text-foreground" : ""}>
                      20D RV
                    </button>
                    <FxInfo wide label="20D Realized Volatility measures how much the FX pair has actually moved over the last 20 trading days, annualized. The percentile shows whether current volatility is high or low versus the pair’s own past year.">
                      20D Realized Volatility measures how much the FX pair has actually moved over the last 20 trading days, annualized. The percentile shows whether current volatility is high or low versus the pair’s own past year.
                    </FxInfo>
                  </span>
                </th>
                <th className="px-2 py-2 font-semibold">
                  <span className="inline-flex items-center justify-end gap-1">
                    <button type="button" onClick={() => toggleSort("policy")} className={sortKey === "policy" ? "text-foreground" : ""}>
                      Policy diff.
                    </button>
                    <FxInfo wide label="Policy differential = base-currency policy rate minus quote-currency policy rate. It shows the current short-rate advantage between the two currencies.">
                      Policy differential = base-currency policy rate minus quote-currency policy rate. It shows the current short-rate advantage between the two currencies.
                    </FxInfo>
                  </span>
                </th>
                <th className="px-4 py-2 font-semibold">
                  <span className="inline-flex items-center justify-end gap-1">
                    <button type="button" onClick={() => toggleSort("carry")} className={sortKey === "carry" ? "text-foreground" : ""}>
                      Carry
                    </button>
                    <FxInfo wide label="Indicative carry based on the interest-rate differential between the two currencies. This is not a live FX forward quote and actual realised carry also depends on FX price movements.">
                      Indicative carry based on the interest-rate differential between the two currencies. This is not a live FX forward quote and actual realised carry also depends on FX price movements.
                    </FxInfo>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ pair, spot, returns, carry, rv20, rvPercentile }) => {
                const selected = pair.id === selectedPairId;
                return (
                  <tr
                    key={pair.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(pair.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(pair.id);
                      }
                    }}
                    className={[
                      "cursor-pointer border-b border-border/60 last:border-0",
                      selected ? "bg-muted/50" : "hover:bg-muted/25",
                    ].join(" ")}
                  >
                    <td className="px-4 py-1.5 text-left font-medium text-foreground">{pair.label}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtRate(spot, pair.digits)}</td>
                    {FX_DESK_PERIODS.map((period) => (
                      <td key={period} className={`px-2 py-1.5 text-right font-mono tabular-nums ${changePctClass(returns[period])}`}>
                        {fmtPct(returns[period])}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right align-middle">
                      {rv20 == null ? (
                        <span className="font-mono text-muted-foreground">—</span>
                      ) : (
                        <div className="ml-auto w-[92px] text-center">
                          <div className="font-mono tabular-nums leading-none text-foreground">{fmtVol(rv20)}</div>
                          {rvPercentile == null ? (
                            <div className="mt-0.5 font-mono text-[10px] leading-none text-muted-foreground">—</div>
                          ) : (
                            <PercentileScale
                              percentile={rvPercentile}
                              compact
                              showHeader={false}
                              explainer={null}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${carryToneClass(carry)}`}>
                      {policyPending ? "" : formatPolicyDiff(carry)}
                    </td>
                    <td className={`px-4 py-1.5 text-right font-mono tabular-nums ${carryToneClass(carry)}`}>
                      {policyPending ? "" : formatIndicativeCarry(carry)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SortHead({
  label,
  active,
  align = "right",
  onClick,
}: {
  label: string;
  active: boolean;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th className={`px-2 py-2 font-semibold ${align === "left" ? "pl-4 text-left" : ""}`}>
      <button type="button" onClick={onClick} className={active ? "text-foreground" : ""}>
        {label}
      </button>
    </th>
  );
}
