import { type CSSProperties } from "react";
import { CommodityInfo } from "@/components/commodities/CommodityInfo";
import { SectorMark } from "@/components/commodities/commodityMarks";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import {
  SECTOR_PERIODS,
  SECTOR_PROVIDERS,
  SECTOR_PROVIDER_SPECS,
  type ProviderPerformance,
  type SectorPerformance,
  type SectorPeriod,
  type SectorProviderId,
  type SectorRow,
} from "@/lib/commodities/sectorPerformance";

/** Full-intensity shading threshold per period, in percent. */
const HEAT_SCALE: Record<SectorPeriod, number> = { "1D": 2.5, "1W": 5, "1M": 10, YTD: 25 };
const REL_HEAT_SCALE = 12;

function formatDay(iso: string | null, withYear = true): string {
  if (!iso) return "N/A";
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function formatReturn(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(2);
  if (fixed === "0.00" || fixed === "-0.00") return "0.00%";
  return `${value > 0 ? "+" : ""}${fixed}%`;
}

function formatPp(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(2);
  if (fixed === "0.00" || fixed === "-0.00") return "0.00pp";
  return `${value > 0 ? "+" : ""}${fixed}pp`;
}

/** Stronger desk wash than the shared FX helper — sparse boards need readable intensity. */
function deskHeat(pct: number | null, scale: number): CSSProperties {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return {};
  const spread = Math.pow(Math.min(Math.abs(pct) / scale, 1), 0.65);
  if (pct > 0) {
    return {
      background: `oklch(${(0.93 - spread * 0.26).toFixed(3)} ${(0.08 + spread * 0.12).toFixed(3)} 150)`,
      color: "#14532d",
    };
  }
  return {
    background: `oklch(${(0.94 - spread * 0.22).toFixed(3)} ${(0.07 + spread * 0.14).toFixed(3)} 25)`,
    color: "#7f1d1d",
  };
}

function returnToneClass(value: number | null): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.005) return "text-muted-foreground";
  return value > 0 ? "text-pos" : "text-neg";
}

export function SectorProviderSwitch({
  provider,
  onProvider,
}: {
  provider: SectorProviderId;
  onProvider: (provider: SectorProviderId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Commodity product provider"
      className="flex rounded-lg border-2 border-foreground/20 bg-muted/60 p-1 shadow-sm"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = provider === "invesco" ? "wisdomtree" : "invesco";
        onProvider(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-provider="${next}"]`)?.focus();
      }}
    >
      {SECTOR_PROVIDERS.map((id) => {
        const active = id === provider;
        const spec = SECTOR_PROVIDER_SPECS[id];
        const usd = spec.currency === "USD";
        return (
          <button
            key={id}
            type="button"
            role="tab"
            data-provider={id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onProvider(id)}
            className={[
              "inline-flex items-center rounded-md px-3.5 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? usd
                  ? "bg-sky-600 text-white shadow-md ring-1 ring-sky-700/40"
                  : "bg-violet-600 text-white shadow-md ring-1 ring-violet-700/40"
                : "text-muted-foreground hover:bg-card/80 hover:text-foreground",
            ].join(" ")}
          >
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}

function periodValue(row: SectorRow, period: SectorPeriod): number | null {
  const cell = row.cells.find((entry) => entry.period === period);
  const value = cell?.returnPct ?? null;
  return value != null && Number.isFinite(value) ? value : null;
}

function rankByPeriod(rows: SectorRow[], period: SectorPeriod) {
  return rows
    .map((row) => ({ row, value: periodValue(row, period) }))
    .filter((entry): entry is { row: SectorRow; value: number } => entry.value != null)
    .sort((a, b) => b.value - a.value);
}

type RankedSector = { row: SectorRow; value: number };

function StripHeadline({ children }: { children: string }) {
  return (
    <div className="mb-1.5 text-center text-[12px] font-[650] tracking-wide text-foreground">
      {children}
    </div>
  );
}

function StripDivider() {
  return <div className="hidden w-px shrink-0 self-stretch bg-border sm:block" aria-hidden />;
}

function HorizonRow({
  period,
  entry,
  className,
}: {
  period: "1D" | "1M";
  entry: RankedSector | null;
  className?: string;
}) {
  return (
    <div className={["flex min-w-0 items-center gap-2.5", className].filter(Boolean).join(" ")}>
      <span className="w-7 shrink-0 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/75">
        {period}
      </span>
      {entry ? (
        <>
          <div className="shrink-0">
            <SectorMark exposure={entry.row.exposure} size="md" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-foreground">
              {entry.row.exposure}
            </div>
            <div
              className={`mt-0.5 font-mono text-[12px] font-semibold tabular-nums ${returnToneClass(entry.value)}`}
            >
              {formatReturn(entry.value)}
            </div>
          </div>
        </>
      ) : (
        <div className="truncate text-[13px] font-semibold leading-tight text-muted-foreground">—</div>
      )}
    </div>
  );
}

/** One Strongest/Weakest headline with 1D + 1M side by side underneath. */
function ExtremeHorizonStat({
  label,
  day,
  month,
}: {
  label: string;
  day: RankedSector | null;
  month: RankedSector | null;
}) {
  return (
    <div className="min-w-0 flex-1">
      <StripHeadline>{label}</StripHeadline>
      <div className="flex min-w-0 items-center justify-center gap-4 sm:gap-5 xl:gap-6">
        <HorizonRow period="1D" entry={day} className="min-w-0" />
        <HorizonRow period="1M" entry={month} className="hidden min-w-0 xl:flex" />
      </div>
    </div>
  );
}

function OutperformingBenchmarkStat({
  rows,
  total,
}: {
  rows: SectorRow[] | null;
  total: number;
}) {
  const count = rows == null || total === 0 ? "—" : `${rows.length}/${total}`;
  const names =
    rows == null
      ? null
      : rows.length === 0
        ? "None"
        : rows.map((row) => row.exposure).join(", ");

  return (
    <div className="min-w-0 flex-1">
      <StripHeadline>Outperforming Bench · 1D</StripHeadline>
      <div className="flex min-w-0 items-baseline justify-center gap-x-2">
        <span className="shrink-0 font-mono text-[12px] font-semibold leading-snug tabular-nums text-foreground">
          {count}
        </span>
        {names ? (
          <span
            className={[
              "min-w-0 truncate text-[12px] font-semibold leading-snug",
              names === "None" ? "text-muted-foreground" : "text-foreground",
            ].join(" ")}
            title={names === "None" ? undefined : names}
          >
            {names}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DeskStrip({
  data,
  onProvider,
}: {
  data: ProviderPerformance;
  onProvider: (provider: SectorProviderId) => void;
}) {
  const sectors = data.rows.filter((row) => !row.benchmark);
  const rankedDay = rankByPeriod(sectors, "1D");
  const strongestDay = rankedDay[0] ?? null;
  const weakestDay = rankedDay.length > 0 ? rankedDay[rankedDay.length - 1] : null;
  const rankedMonth = rankByPeriod(sectors, "1M");
  const strongestMonth = rankedMonth[0] ?? null;
  const weakestMonth = rankedMonth.length > 0 ? rankedMonth[rankedMonth.length - 1] : null;
  const bench = data.rows.find((row) => row.benchmark) ?? null;
  const benchDay = bench ? periodValue(bench, "1D") : null;
  const beatingRows =
    benchDay == null
      ? null
      : sectors.filter((row) => {
          const value = periodValue(row, "1D");
          return value != null && value > benchDay;
        });

  return (
    <div className="flex items-stretch gap-5 overflow-x-auto border-b border-border px-5 py-3.5 sm:gap-6 xl:gap-8 xl:px-6">
      <div className="flex shrink-0 items-center">
        <SectorProviderSwitch provider={data.provider} onProvider={onProvider} />
      </div>
      <StripDivider />
      <ExtremeHorizonStat label="Strongest sector" day={strongestDay} month={strongestMonth} />
      <StripDivider />
      <ExtremeHorizonStat label="Weakest sector" day={weakestDay} month={weakestMonth} />
      <StripDivider />
      <OutperformingBenchmarkStat rows={beatingRows} total={sectors.length} />
    </div>
  );
}

function MethodologyBody({
  provider,
  data,
}: {
  provider: SectorProviderId;
  data?: ProviderPerformance | null;
}) {
  const isInvesco = provider === "invesco";
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-semibold leading-snug text-foreground">
        {isInvesco ? "Invesco" : "WisdomTree"}
      </p>
      <p className="leading-snug text-foreground">
        {isInvesco
          ? "Commodity sector performance based on Invesco ETFs (exchange-traded funds)."
          : "Commodity sector performance based on WisdomTree ETCs (exchange-traded commodities)."}
      </p>
      <p className="leading-snug text-muted-foreground">
        {isInvesco
          ? "Price returns in USD · Excludes distributions"
          : "Price returns in EUR · Excludes distributions"}
      </p>
      <p className="leading-snug text-muted-foreground">
        As of: {formatDay(data?.asOf ?? null)}
      </p>
    </div>
  );
}

export function SectorPerformanceTitle({
  provider,
  data,
}: {
  provider: SectorProviderId;
  data?: ProviderPerformance | null;
  fromStaleCache?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      Commodity Sector Performance
      <span className="ml-3 inline-flex items-center gap-1 normal-case">
        <span className="text-[12px] font-bold leading-none tracking-wide text-foreground">
          {provider === "invesco" ? "Invesco" : "WisdomTree"}
        </span>
        <CommodityInfo label="About sector performance" side="bottom">
          <MethodologyBody provider={provider} data={data} />
        </CommodityInfo>
      </span>
    </span>
  );
}

export function SectorPerformancePanel({
  data,
  pending,
  error,
  provider,
  onProvider,
}: {
  data: SectorPerformance | undefined;
  pending: boolean;
  error: string | null;
  provider: SectorProviderId;
  onProvider: (provider: SectorProviderId) => void;
}) {
  const spec = SECTOR_PROVIDER_SPECS[provider];
  const current = data?.providers?.[provider] ?? null;

  if (pending && !data) {
    return (
      <div className="flex h-36 items-center justify-center">
        <YieldCurveFetchSpinner label={`Loading ${spec.label} returns`} />
      </div>
    );
  }

  if (!current) {
    return <p className="px-4 py-6 text-[12px] text-muted-foreground">Data unavailable. {error ?? `The ${spec.label} feed failed.`}</p>;
  }

  const bench = current.rows.find((row) => row.benchmark) ?? null;
  const benchYtd = bench ? periodValue(bench, "YTD") : null;
  const underlyingByTicker = Object.fromEntries(
    SECTOR_PROVIDER_SPECS[provider].funds.map((fund) => [fund.ticker, fund.underlyingCommodities]),
  );

  return (
    <div>
      <DeskStrip data={current} onProvider={onProvider} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-[12px]">
          <colgroup>
            <col className="w-[26%]" />
            {SECTOR_PERIODS.map((period) => (
              <col key={period} className="w-[14%]" />
            ))}
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <th className="bg-muted/30 px-4 py-2 text-left font-semibold">Sector</th>
              {SECTOR_PERIODS.map((period) => (
                <th
                  key={period}
                  className="bg-muted/30 px-1.5 py-2 text-center font-semibold"
                  title={`Compared with the close on ${formatDay(current.references[period])}`}
                >
                  {period}
                </th>
              ))}
              <th className="border-l border-border bg-muted/30 px-2 py-2 text-center font-semibold">
                <span className="inline-flex items-center justify-center gap-1 normal-case tracking-normal">
                  <span className="uppercase tracking-[0.12em]">
                    vs {bench?.ticker ?? "Bench"}
                  </span>
                  <CommodityInfo label="About vs benchmark">
                    <p>
                      Sector return minus the broad commodity benchmark ({bench?.ticker ?? "N/A"}), in
                      percentage points.
                    </p>
                  </CommodityInfo>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {current.rows.map((row) => {
              const ytd = periodValue(row, "YTD");
              const relative = row.benchmark || ytd == null || benchYtd == null ? null : ytd - benchYtd;
              const relStyle = row.benchmark ? {} : deskHeat(relative, REL_HEAT_SCALE);

              return (
                <tr
                  key={row.ticker}
                  className={[
                    "border-b border-border/60 last:border-b-0",
                    row.benchmark ? "bg-muted/20" : "hover:bg-muted/10",
                  ].join(" ")}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <SectorMark exposure={row.exposure} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div
                            className={[
                              "truncate text-[13px] leading-tight text-foreground",
                              row.benchmark ? "font-bold" : "font-semibold",
                            ].join(" ")}
                          >
                            {row.exposure}
                          </div>
                          <CommodityInfo label={`About ${row.exposure}`} wide>
                            <div className="space-y-1.5">
                              <p className="leading-snug text-muted-foreground">
                                Ticker:{" "}
                                <span className="font-mono font-medium text-foreground">
                                  {row.ticker}
                                </span>
                              </p>
                              <p className="leading-snug text-muted-foreground">
                                Underlying commodities:{" "}
                                <span className="font-medium text-foreground">
                                  {underlyingByTicker[row.ticker] ?? "—"}
                                </span>
                              </p>
                            </div>
                          </CommodityInfo>
                        </div>
                        {row.benchmark ? (
                          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Benchmark ({row.ticker})
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {row.cells.map((cell) => {
                    const value = cell.returnPct;
                    const style = deskHeat(value, HEAT_SCALE[cell.period]);
                    return (
                      <td
                        key={cell.period}
                        className={[
                          "border-l border-border/40 px-1.5 py-3.5 text-center font-mono text-[12px] tabular-nums",
                          style.color ? "" : returnToneClass(value),
                          row.benchmark ? "font-semibold" : "",
                        ].join(" ")}
                        style={style}
                        title={
                          value == null
                            ? (row.unavailableReason ?? `No traded ${row.ticker} close on ${formatDay(cell.referenceDate)}.`)
                            : `${row.ticker} ${row.latestClose?.toFixed(3)} ${spec.currency} on ${formatDay(row.latestDate)} vs ${cell.referenceClose?.toFixed(3)} on ${formatDay(cell.referenceDate)}`
                        }
                      >
                        {formatReturn(value)}
                        {cell.distributionInWindow && value != null ? <span aria-label="Distribution in period">†</span> : null}
                      </td>
                    );
                  })}
                  <td
                    className={[
                      "border-l border-border px-2 py-3.5 text-center font-mono text-[12px] tabular-nums",
                      row.benchmark ? "bg-muted/30 text-muted-foreground" : relStyle.color ? "font-semibold" : returnToneClass(relative),
                    ].join(" ")}
                    style={row.benchmark ? undefined : relStyle}
                    title={
                      row.benchmark
                        ? "Broad benchmark row"
                        : relative == null
                          ? "Relative return unavailable"
                          : `${row.ticker} YTD ${formatReturn(ytd)} minus ${bench?.ticker ?? "bench"} YTD ${formatReturn(benchYtd)}`
                    }
                  >
                    {row.benchmark ? "—" : formatPp(relative)}
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
