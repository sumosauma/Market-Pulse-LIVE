import { useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/PageShell";
import { changePctClass } from "@/lib/equities/equityHeatmapColors";
import { carryToneClass, formatCarryBps, type FxCarry } from "@/lib/fx/carry";
import {
  CARRY_MONITOR_PAIRS,
  driverRows,
  FX_CHART_WINDOWS,
  FX_DESK_PERIODS,
  g10Rows,
  indexedRelationship,
  pairSeries,
  rankG10,
  rateDifferential,
  returnOverSessions,
  sekRegime,
  SEK_PAIRS,
  strongestRelationship,
  swedenSpread,
  VOL_MONITOR_PAIRS,
  volatilitySnapshot,
  latestClose,
  type FxChartWindow,
  type FxDeskPeriod,
} from "@/lib/fx/desk";
import { FX_PAIRS, getFxPair, type FxPairId } from "@/lib/fx/pairs";
import { useFxDeskMarket, useFxPositioning, useFxYieldHistory } from "@/lib/fx/useFxDesk";
import type { FxLiveRow } from "@/lib/fx/types";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import { fmtBps, fmtContracts, fmtCorr, fmtPct, fmtRate, fmtVol, heatBackground, ordinal } from "./fxFormat";
import { FxChips, FxInfo, FxSectionStatus } from "./FxSection";

function CardSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-[72px] items-center justify-center">
      <YieldCurveFetchSpinner label={label} />
    </div>
  );
}

function periodReturn(series: { date: string; close: number }[], period: FxDeskPeriod): number | null {
  const sessions = period === "1D" ? 1 : period === "1W" ? 5 : period === "1M" ? 21 : 63;
  return returnOverSessions(series, sessions);
}

export function FxG10Performance({
  period,
  onPeriod,
}: {
  period: FxDeskPeriod;
  onPeriod: (period: FxDeskPeriod) => void;
}) {
  const query = useFxDeskMarket();
  const ranked = useMemo(() => {
    if (!query.data) return [];
    return rankG10(g10Rows(query.data), period);
  }, [query.data, period]);
  const strongest = ranked.find((row) => row.returns[period] != null);
  const weakest = [...ranked].reverse().find((row) => row.returns[period] != null);

  return (
    <Panel
      title="G10 Currency Performance"
      meta="Strength versus the US dollar. Inverse quotes use the reciprocal price, then the return. USD is the zero reference."
      actions={<FxChips options={FX_DESK_PERIODS} value={period} onChange={onPeriod} />}
    >
      {query.isPending && !query.data ? (
        <FxSectionStatus label="Loading G10 performance" />
      ) : query.isError || !query.data ? (
        <FxSectionStatus message="G10 history is unavailable." />
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-semibold">Currency</th>
                  {FX_DESK_PERIODS.map((item) => (
                    <th key={item} className={["px-3 py-2 font-semibold", item === period ? "text-foreground" : ""].join(" ")}>
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, index) => (
                  <tr key={row.currency} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-1.5 text-left font-medium text-foreground">
                      <span className="mr-2 tabular-nums text-muted-foreground">{index + 1}</span>
                      {row.currency}
                      {row.currency === "USD" ? <span className="ml-2 text-[10px] text-muted-foreground">reference</span> : null}
                    </td>
                    {FX_DESK_PERIODS.map((item) => {
                      const value = row.returns[item];
                      return (
                        <td
                          key={item}
                          className={[
                            "px-3 py-1.5 text-right tabular-nums",
                            item === period ? "font-medium" : "",
                            row.currency === "USD" ? "text-muted-foreground" : changePctClass(value),
                          ].join(" ")}
                          style={{ background: row.currency === "USD" ? undefined : heatBackground(value) }}
                        >
                          {fmtPct(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 border-t border-border lg:grid-cols-1 lg:border-l lg:border-t-0">
            <div className="px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Strongest G10</div>
              <div className="mt-1 text-[14px] font-semibold text-foreground">{strongest?.currency ?? "—"}</div>
              <div className={`mt-0.5 text-[12px] tabular-nums ${changePctClass(strongest?.returns[period] ?? null)}`}>
                {fmtPct(strongest?.returns[period] ?? null)} · {period}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weakest G10</div>
              <div className="mt-1 text-[14px] font-semibold text-foreground">{weakest?.currency ?? "—"}</div>
              <div className={`mt-0.5 text-[12px] tabular-nums ${changePctClass(weakest?.returns[period] ?? null)}`}>
                {fmtPct(weakest?.returns[period] ?? null)} · {period}
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function MetricCard({
  title,
  info,
  children,
}: {
  title: string;
  info: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {info}
      </div>
      <div className="mt-1.5 min-h-[72px]">{children}</div>
    </div>
  );
}

export function FxPairAnalytics({
  pairId,
  onSelect,
  liveRow,
  livePending,
  carry,
  carryPending,
}: {
  pairId: FxPairId;
  onSelect: (pairId: FxPairId) => void;
  liveRow: FxLiveRow | undefined;
  livePending: boolean;
  carry: FxCarry | undefined;
  carryPending: boolean;
}) {
  const market = useFxDeskMarket();
  const yields = useFxYieldHistory();
  const pair = getFxPair(pairId)!;
  const series = useMemo(
    () => (market.data ? pairSeries(pair.from, pair.to, market.data.usdQuotes) : []),
    [market.data, pair.from, pair.to],
  );
  const diff = useMemo(
    () => rateDifferential(pair.from, pair.to, yields.data ?? null),
    [pair.from, pair.to, yields.data],
  );
  const vol = useMemo(() => volatilitySnapshot(series), [series]);
  const spot = liveRow?.rate ?? latestClose(series);
  const day = liveRow?.change1dPct ?? periodReturn(series, "1D");
  const week = periodReturn(series, "1W");
  const month = periodReturn(series, "1M");
  const spotLoading = livePending && spot == null;

  return (
    <Panel
      title="FX Pair Analytics"
      meta="Selected pair. Spot uses the ECB reference print. Returns are calculated from that history."
      actions={
        <div className="flex max-w-[640px] flex-wrap justify-end gap-1">
          {FX_PAIRS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={[
                "rounded-sm border px-2 py-1 text-[11px] font-medium",
                item.id === pairId
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Spot" info={<span className="text-[10px] text-muted-foreground">ECB ref.</span>}>
          {spotLoading ? (
            <CardSpinner label="Loading spot" />
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">{pair.label}</div>
              <div className="text-[20px] font-semibold tabular-nums leading-tight text-foreground">{fmtRate(spot, pair.digits)}</div>
              <div className={`text-[12px] tabular-nums ${changePctClass(day)}`}>{fmtPct(day)} · 1D</div>
              <div className="mt-1 flex gap-3 text-[11px] tabular-nums text-muted-foreground">
                <span className={changePctClass(week)}>1W {fmtPct(week)}</span>
                <span className={changePctClass(month)}>1M {fmtPct(month)}</span>
              </div>
            </>
          )}
        </MetricCard>

        <MetricCard
          title="Rate Differential"
          info={
            <FxInfo label="Rate differential">
              Yield differential = base-currency yield minus quote-currency yield. Changes in relative rates are an important FX driver, but do not determine FX moves by themselves.
            </FxInfo>
          }
        >
          {yields.isPending && !yields.data ? (
            <CardSpinner label="Loading yield differential" />
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">{diff.diff2yBps == null ? "2Y differential" : diff.label2y}</div>
              <div className="text-[20px] font-semibold tabular-nums leading-tight text-foreground">{fmtBps(diff.diff2yBps)}</div>
              <div className={`text-[12px] tabular-nums ${changePctClass(diff.change1m2yBps)}`}>{fmtBps(diff.change1m2yBps)} · 1M</div>
              <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                10Y {fmtBps(diff.diff10yBps)}
                {diff.change1m10yBps != null ? <span className={changePctClass(diff.change1m10yBps)}> · {fmtBps(diff.change1m10yBps)} 1M</span> : null}
              </div>
            </>
          )}
        </MetricCard>

        <MetricCard
          title="Carry"
          info={
            <FxInfo label="Carry methodology" wide>
              Policy-rate differential = base central-bank rate minus quote central-bank rate, in basis points. Fed funds uses the midpoint of the target range. This is an interest-rate differential, not FX forward points and not a tradable carry quote.
            </FxInfo>
          }
        >
          {carryPending && !carry ? (
            <CardSpinner label="Loading policy rates" />
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">Policy rate differential</div>
              <div className={`text-[20px] font-semibold tabular-nums leading-tight ${carryToneClass(carry?.bps ?? null)}`}>
                {formatCarryBps(carry?.bps ?? null)}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Indicative annualised carry from policy rates. Forward points are not quoted.
              </div>
            </>
          )}
        </MetricCard>

        <MetricCard
          title="Volatility"
          info={
            <FxInfo label="Realized volatility" wide>
              20D and 60D realized volatility are the sample standard deviation of daily log returns, annualised with √252. The percentile ranks today’s 20D reading against the last 252 observations, and needs at least 200 of them. This is not implied volatility.
            </FxInfo>
          }
        >
          {market.isPending && !market.data ? (
            <CardSpinner label="Loading realized volatility" />
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">20D realized</div>
              <div className="text-[20px] font-semibold tabular-nums leading-tight text-foreground">{fmtVol(vol.rv20)}</div>
              <div className="text-[12px] tabular-nums text-muted-foreground">60D {fmtVol(vol.rv60)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">1Y percentile {ordinal(vol.percentile1y)}</div>
            </>
          )}
        </MetricCard>
      </div>
    </Panel>
  );
}

export function FxRatesRelationship({ pairId, window, onWindow }: { pairId: FxPairId; window: FxChartWindow; onWindow: (window: FxChartWindow) => void }) {
  const market = useFxDeskMarket();
  const yields = useFxYieldHistory();
  const pair = getFxPair(pairId)!;
  const chart = useMemo(() => {
    if (!market.data) return { points: [], ratesAvailable: false };
    const fx = pairSeries(pair.from, pair.to, market.data.usdQuotes);
    const diff = rateDifferential(pair.from, pair.to, yields.data ?? null);
    return indexedRelationship(fx, diff.series2y, window);
  }, [market.data, yields.data, pair.from, pair.to, window]);

  return (
    <Panel
      title="FX Price + Rates Relationship"
      meta="Both series are rebased to 100 at the start of the window."
      actions={
        <div className="flex items-center gap-2">
          <FxInfo label="FX and rates relationship">
            Shows how the FX pair and its 2Y yield differential have moved over the same period. Relationship does not imply causation.
          </FxInfo>
          <FxChips options={FX_CHART_WINDOWS} value={window} onChange={onWindow} />
        </div>
      }
    >
      {market.isPending && !market.data ? (
        <FxSectionStatus label="Loading FX history" />
      ) : chart.points.length < 2 ? (
        <FxSectionStatus message="Not enough overlapping history for this window." />
      ) : (
        <div className="px-2 py-3">
          {!chart.ratesAvailable ? (
            <p className="px-2 pb-2 text-[11px] text-muted-foreground">
              2Y differential history is unavailable for {pair.label}. The line is the FX pair only.
            </p>
          ) : null}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={28} tickFormatter={(value: string) => value.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} width={42} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: "var(--card)", border: "1px solid var(--border)" }}
                  formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : "—", name === "fx" ? pair.label : "2Y differential"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => (value === "fx" ? pair.label : "2Y differential")} />
                <Line type="monotone" dataKey="fx" stroke="#94a3b8" dot={false} strokeWidth={1.6} />
                {chart.ratesAvailable ? <Line type="monotone" dataKey="rates" stroke="#38bdf8" dot={false} strokeWidth={1.6} /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function FxCarryMonitor({
  liveById,
  carryById,
}: {
  liveById: Partial<Record<FxPairId, FxLiveRow>>;
  carryById: Partial<Record<FxPairId, FxCarry>>;
}) {
  const market = useFxDeskMarket();
  const yields = useFxYieldHistory();

  return (
    <Panel
      title="FX Carry & Forward Monitor"
      meta="Policy-rate differential is indicative carry. The forward column is blank because no free forward-points feed is connected."
      actions={
        <FxInfo label="Indicative carry" wide>
          Carry here is the base policy rate minus the quote policy rate. It is not a market forward, and it is not a tradable quote. A theoretical CIP forward would need matched money-market rates for each tenor; policy rates are not that input, so no theoretical forward is shown.
        </FxInfo>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Pair</th>
              <th className="px-3 py-2 font-semibold">Spot</th>
              <th className="px-3 py-2 font-semibold">Rate differential</th>
              <th className="px-3 py-2 font-semibold">Indicative carry</th>
              <th className="px-4 py-2 font-semibold">Forward</th>
            </tr>
          </thead>
          <tbody>
            {CARRY_MONITOR_PAIRS.map((id) => {
              const pair = getFxPair(id)!;
              const series = market.data ? pairSeries(pair.from, pair.to, market.data.usdQuotes) : [];
              const diff = rateDifferential(pair.from, pair.to, yields.data ?? null);
              const spot = liveById[id]?.rate ?? latestClose(series);
              return (
                <tr key={id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5 text-left font-medium text-foreground">{pair.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{market.isPending && spot == null ? "…" : fmtRate(spot, pair.digits)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{fmtBps(diff.diff2yBps)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${carryToneClass(carryById[id]?.bps ?? null)}`}>
                    {formatCarryBps(carryById[id]?.bps ?? null)}
                  </td>
                  <td className="px-4 py-1.5 text-right text-muted-foreground">—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function FxVolatilityMonitor() {
  const market = useFxDeskMarket();
  const rows = useMemo(() => {
    if (!market.data) return [];
    return VOL_MONITOR_PAIRS.map((id) => {
      const pair = getFxPair(id)!;
      const vol = volatilitySnapshot(pairSeries(pair.from, pair.to, market.data!.usdQuotes));
      return { id, label: pair.label, ...vol };
    }).sort((a, b) => {
      if (a.rv20 == null && b.rv20 == null) return 0;
      if (a.rv20 == null) return 1;
      if (b.rv20 == null) return -1;
      return b.rv20 - a.rv20;
    });
  }, [market.data]);

  return (
    <Panel
      title="FX Volatility"
      meta="Realized volatility from daily ECB reference rates. Implied volatility and risk reversals are not shown."
      actions={
        <FxInfo label="Realized volatility monitor">
          Sorted by 20-day realized volatility. 60-day uses the same sample standard deviation and √252 annualisation. The 1Y percentile compares the current 20-day reading with its last 252 observations.
        </FxInfo>
      }
    >
      {market.isPending && !market.data ? (
        <FxSectionStatus label="Loading FX volatility" />
      ) : market.isError ? (
        <FxSectionStatus message="Volatility history is unavailable." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Pair</th>
                <th className="px-3 py-2 font-semibold">20D RV</th>
                <th className="px-3 py-2 font-semibold">60D RV</th>
                <th className="px-4 py-2 font-semibold">1Y percentile</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5 text-left font-medium text-foreground">{row.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtVol(row.rv20)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtVol(row.rv60)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{ordinal(row.percentile1y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function FxDrivers({ pairId }: { pairId: FxPairId }) {
  const market = useFxDeskMarket();
  const yields = useFxYieldHistory();
  const pair = getFxPair(pairId)!;
  const rows = useMemo(() => {
    if (!market.data) return [];
    const fx = pairSeries(pair.from, pair.to, market.data.usdQuotes);
    const diff = rateDifferential(pair.from, pair.to, yields.data ?? null);
    return driverRows(pairId, fx, market.data, diff.series2y);
  }, [market.data, yields.data, pair.from, pair.to, pairId]);
  const sentence = strongestRelationship(pair.label, rows);

  return (
    <Panel
      title="FX Drivers"
      meta="Recent market relationships · 60 trading days"
      actions={
        <FxInfo label="60-day correlations" wide>
          Correlation measures how the variables have moved together recently. It does not prove that one variable caused the FX move. FX and market factors use daily log returns. The rate differential uses daily changes in the 2Y spread.
        </FxInfo>
      }
    >
      {market.isPending && !market.data ? (
        <FxSectionStatus label="Loading market relationships" />
      ) : (
        <div className="px-4 py-3">
          {sentence ? <p className="mb-2 text-[12px] text-foreground">{sentence}</p> : null}
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left font-semibold">Driver</th>
                <th className="py-2 text-right font-semibold">60D correlation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 text-foreground">{row.label}</td>
                  <td className={`py-1.5 text-right tabular-nums ${changePctClass(row.correlation)}`}>{fmtCorr(row.correlation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function FxPositioning() {
  const query = useFxPositioning();
  return (
    <Panel
      title="FX Positioning"
      meta={query.data?.reportDate ? `CFTC leveraged funds · futures only · report ${query.data.reportDate}` : "CFTC leveraged funds · futures only"}
      actions={
        <FxInfo label="CFTC positioning" wide>
          CFTC positioning reflects reported futures positions and is used as a proxy for speculative market positioning. It does not represent total FX market flow. Net is leveraged-funds long contracts minus short contracts. The percentile ranks that net against the last 52 weekly reports.
        </FxInfo>
      }
    >
      {query.isPending && !query.data ? (
        <FxSectionStatus label="Loading CFTC positioning" />
      ) : query.isError || !query.data ? (
        <FxSectionStatus message="CFTC positioning is unavailable. SEK and NOK are not in this futures report." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Currency</th>
                <th className="px-3 py-2 font-semibold">Net speculative</th>
                <th className="px-3 py-2 font-semibold">Weekly change</th>
                <th className="px-4 py-2 font-semibold">1Y percentile</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((row) => (
                <tr key={row.currency} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5 text-left font-medium text-foreground">{row.currency}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${changePctClass(row.net)}`}>{fmtContracts(row.net)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${changePctClass(row.weeklyChange)}`}>{fmtContracts(row.weeklyChange)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{ordinal(row.percentile1y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-muted-foreground">SEK and NOK have no contract in this CFTC financial-futures report.</p>
        </div>
      )}
    </Panel>
  );
}

export function FxSekMonitor({ period }: { period: FxDeskPeriod }) {
  const market = useFxDeskMarket();
  const yields = useFxYieldHistory();
  const view = useMemo(() => {
    if (!market.data) return null;
    const ranked = rankG10(g10Rows(market.data), period);
    const ranked1m = rankG10(g10Rows(market.data), "1M");
    const sekIndex = ranked.findIndex((row) => row.currency === "SEK");
    const sek = ranked[sekIndex];
    const sek1mIndex = ranked1m.findIndex((row) => row.currency === "SEK");
    const sek1m = ranked1m[sek1mIndex];
    const vix = market.data.factors.vix ?? [];
    const omx = market.data.factors.omx ?? [];
    const brent = market.data.factors.brent ?? [];
    const seUs = swedenSpread("USD", "2Y", yields.data ?? null);
    const regime = sekRegime({
      spreadChange1mBps: seUs.change1mBps,
      sekReturn1m: sek1m?.returns["1M"] ?? null,
      vixChange1m: periodReturn(vix, "1M"),
      sekRank: sek1mIndex >= 0 && sek1m?.returns["1M"] != null ? sek1mIndex + 1 : null,
    });
    return {
      pairs: SEK_PAIRS.map((id) => {
        const def = getFxPair(id)!;
        const series = pairSeries(def.from, def.to, market.data!.usdQuotes);
        return {
          id,
          label: def.label,
          spot: latestClose(series),
          digits: def.digits,
          d1: periodReturn(series, "1D"),
          w1: periodReturn(series, "1W"),
          m1: periodReturn(series, "1M"),
        };
      }),
      rank: sekIndex >= 0 && sek?.returns[period] != null ? sekIndex + 1 : null,
      sekReturn: sek?.returns[period] ?? null,
      seUs,
      vix: latestClose(vix),
      vix1m: periodReturn(vix, "1M"),
      omx1m: periodReturn(omx, "1M"),
      brent1m: periodReturn(brent, "1M"),
      regime,
    };
  }, [market.data, yields.data, period]);

  return (
    <Panel
      title="SEK Monitor"
      meta="Nordic crosses, Sweden’s G10 rank, and the US rate relationship. Euro and Norway yield spreads are not shown: those curves are not on a comparable daily history."
      actions={
        <FxInfo label="SEK regime" wide>
          The label uses four published rules, in order, all on a 1-month window. Rate-supported: the Sweden minus US 2Y spread widened by at least 5 bps and SEK strengthened versus the dollar. Rate-headwind: that spread tightened by at least 5 bps and SEK weakened. Risk-on support: VIX fell at least 5% and SEK’s 1M G10 rank is 1–4. Risk-off pressure: VIX rose at least 5% and that rank is 7–10. Anything else with data is Mixed. A missing input skips that rule.
        </FxInfo>
      }
    >
      {market.isPending && !view ? (
        <FxSectionStatus label="Loading SEK monitor" />
      ) : !view ? (
        <FxSectionStatus message="SEK history is unavailable." />
      ) : (
        <div className="grid gap-3 p-3 lg:grid-cols-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SEK FX</div>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 text-left font-semibold">Pair</th>
                  <th className="font-semibold">1D</th>
                  <th className="font-semibold">1W</th>
                  <th className="font-semibold">1M</th>
                </tr>
              </thead>
              <tbody>
                {view.pairs.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-1.5 text-left">
                      <div className="font-medium text-foreground">{row.label}</div>
                      <div className="tabular-nums text-muted-foreground">{fmtRate(row.spot, row.digits)}</div>
                    </td>
                    <td className={`text-right tabular-nums ${changePctClass(row.d1)}`}>{fmtPct(row.d1)}</td>
                    <td className={`text-right tabular-nums ${changePctClass(row.w1)}`}>{fmtPct(row.w1)}</td>
                    <td className={`text-right tabular-nums ${changePctClass(row.m1)}`}>{fmtPct(row.m1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SEK G10 rank</div>
              <div className="mt-1 text-[16px] font-semibold text-foreground">
                {view.rank == null ? "—" : `SEK: #${view.rank} / 10 over ${period}`}
              </div>
              <div className={`text-[12px] tabular-nums ${changePctClass(view.sekReturn)}`}>{fmtPct(view.sekReturn)} vs USD</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Regime</div>
              <div className="mt-1 text-[14px] font-semibold text-foreground">{view.regime ?? "—"}</div>
            </div>
          </div>
          <div className="space-y-2 text-[12px]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sweden − US 2Y</div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Current</span>
              <span className={`tabular-nums ${changePctClass(view.seUs.currentBps)}`}>{yields.isPending && !yields.data ? "…" : fmtBps(view.seUs.currentBps)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">1M change</span>
              <span className={`tabular-nums ${changePctClass(view.seUs.change1mBps)}`}>{fmtBps(view.seUs.change1mBps)}</span>
            </div>
            <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk context</div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">VIX</span>
              <span className="tabular-nums">{view.vix == null ? "—" : view.vix.toFixed(1)} <span className={changePctClass(view.vix1m)}>{fmtPct(view.vix1m)} 1M</span></span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">OMXS30</span>
              <span className={`tabular-nums ${changePctClass(view.omx1m)}`}>{fmtPct(view.omx1m)} 1M</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Brent</span>
              <span className={`tabular-nums ${changePctClass(view.brent1m)}`}>{fmtPct(view.brent1m)} 1M</span>
            </div>
            <p className="text-[11px] text-muted-foreground">SE − Euro 2Y and SE − Norway 2Y are — . Norway’s 2Y is a zero-coupon curve and the euro has no daily government series here.</p>
          </div>
        </div>
      )}
    </Panel>
  );
}
