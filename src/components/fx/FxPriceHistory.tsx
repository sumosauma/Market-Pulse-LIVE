import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/PageShell";
import { mapPctColor } from "@/lib/equities/equityMapStyle";
import { historyChangePct } from "@/lib/fx/slice";
import { latestClose, pairSeries, type FxDeskMarket } from "@/lib/fx/desk";
import { FX_PAIRS, getFxPair, type FxPairId } from "@/lib/fx/pairs";
import { fmtRate } from "./fxFormat";
import { FxChips, FxSectionStatus } from "./FxSection";

export const FX_PRICE_WINDOWS = ["1D", "1W", "1M", "3M", "6M", "1Y"] as const;
export type FxPriceWindow = (typeof FX_PRICE_WINDOWS)[number];

const WINDOW_SESSIONS: Record<FxPriceWindow, number> = {
  "1D": 1,
  "1W": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
};

function sliceWindow(series: { date: string; close: number }[], window: FxPriceWindow) {
  const count = WINDOW_SESSIONS[window] + 1;
  return series.length <= count ? series : series.slice(-count);
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  if (!month || !day) return iso;
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1] ?? month}`;
}

export function FxPriceHistory({
  market,
  loading,
  pairId,
  onPair,
  window,
  onWindow,
}: {
  market: FxDeskMarket | undefined;
  loading: boolean;
  pairId: FxPairId;
  onPair: (id: FxPairId) => void;
  window: FxPriceWindow;
  onWindow: (window: FxPriceWindow) => void;
}) {
  const pair = getFxPair(pairId)!;
  const series = useMemo(
    () => (market ? sliceWindow(pairSeries(pair.from, pair.to, market.usdQuotes), window) : []),
    [market, pair.from, pair.to, window],
  );
  const change = historyChangePct(series);
  const last = latestClose(series);

  return (
    <Panel
      title="FX Price History"
      meta={last != null ? `${pair.label} · ${fmtRate(last, pair.digits)}` : pair.label}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            aria-label="FX pair"
            value={pairId}
            onChange={(event) => onPair(event.target.value as FxPairId)}
            className="h-7 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-foreground"
          >
            {FX_PAIRS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <FxChips options={FX_PRICE_WINDOWS} value={window} onChange={onWindow} />
        </div>
      }
    >
      {loading ? (
        <FxSectionStatus label="Loading FX history" />
      ) : !market ? (
        <FxSectionStatus message="FX history is unavailable." />
      ) : series.length < 2 ? (
        <div className="flex h-[260px] items-center justify-center text-[12px] text-muted-foreground">
          Not enough history for {pair.label}
        </div>
      ) : (
        <div className="h-[260px] px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.28)" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                minTickGap={40}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                width={64}
                tickFormatter={(value: number) => fmtRate(value, pair.digits)}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
                labelFormatter={(label) => String(label)}
                formatter={(value) => [fmtRate(typeof value === "number" ? value : null, pair.digits), pair.label]}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke={mapPctColor(change)}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
