import { EquityDetailChart } from "@/components/equities/EquityDetailChart";
import { FxPairFlags } from "@/components/fx/FxPairFlags";
import { FX_TIMEFRAMES, type FxTimeframe } from "@/lib/fx/types";
import { getFxPair, type FxPairId } from "@/lib/fx/pairs";
import { historyChangePct, sliceFxPoints } from "@/lib/fx/slice";
import type { FxPoint } from "@/lib/fx/types";

function fmtRate(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1] ?? m}`;
}

export function FxPairChart({
  pairId,
  timeframe,
  onTimeframe,
  points,
  isLoading,
  error,
}: {
  pairId: FxPairId;
  timeframe: FxTimeframe;
  onTimeframe: (tf: FxTimeframe) => void;
  points: readonly FxPoint[];
  isLoading: boolean;
  error: string | null;
}) {
  const pair = getFxPair(pairId)!;
  const sliced = sliceFxPoints(points, timeframe);
  const values = sliced.map((p) => p.close);
  const dates = sliced.map((p) => p.date);
  const changePct = historyChangePct(sliced);
  const isDailyFix = timeframe === "1D";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
          <FxPairFlags pair={pair} size="sm" />
          <span>
            {pair.label}
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
              {timeframe}
            </span>
          </span>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {FX_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframe(tf)}
              className={[
                "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                tf === timeframe
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="flex h-[260px] items-center justify-center text-[12px] text-muted-foreground">
          Loading {pair.label} history…
        </div>
      ) : error ? (
        <div className="flex h-[260px] items-center justify-center px-4 text-center text-[12px] text-amber-700 dark:text-amber-400">
          {error}
        </div>
      ) : values.length < 2 ? (
        <div className="flex h-[260px] items-center justify-center text-[12px] text-muted-foreground">
          Not enough history for {pair.label} {timeframe}
        </div>
      ) : (
        <div>
          {isDailyFix && sliced.length >= 2 ? (
            <div className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
              Prior close {fmtDate(sliced[0]!.date)} {fmtRate(sliced[0]!.close, pair.digits)}
              {" → "}
              latest fix {fmtDate(sliced[1]!.date)} {fmtRate(sliced[1]!.close, pair.digits)}
              <span className="ml-2 text-[10px]">ECB daily reference · no intraday data</span>
            </div>
          ) : null}
          <div className="px-1 pb-1">
            <EquityDetailChart
              values={values}
              dates={dates}
              dateLabelMode="date"
              changePercent={changePct}
              axisDigits={pair.digits}
            />
          </div>
        </div>
      )}
    </div>
  );
}
