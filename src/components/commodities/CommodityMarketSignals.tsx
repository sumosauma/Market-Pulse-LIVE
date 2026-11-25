import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { CommodityInfo } from "@/components/commodities/CommodityInfo";
import { InstrumentMark } from "@/components/commodities/commodityMarks";
import { FxPairFlags } from "@/components/fx/FxPairFlags";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import { getFxPair } from "@/lib/fx/pairs";
import {
  SIGNAL_CATEGORY_LABELS,
  SIGNAL_CATEGORY_ORDER,
  formatPercentileShort,
  type CommoditySignal,
  type CommoditySignalsPayload,
  type SignificanceScale,
  type SignalCategory,
} from "@/lib/commodities/signals";

function toneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1e-12) {
    return "text-foreground";
  }
  return value > 0 ? "text-pos" : "text-neg";
}

function costToneClass(direction: "higher" | "lower" | "unchanged"): string {
  if (direction === "higher") return "text-neg";
  if (direction === "lower") return "text-pos";
  return "text-muted-foreground";
}

const PERCENTILE_MARKER_PX = 9;

function SignificanceMeter({
  scale,
  priorPercentile,
}: {
  scale: SignificanceScale;
  /** When set, shows “N Percentile 1W ago” under the current percentile. */
  priorPercentile?: number | null;
}) {
  const accentExtreme = scale.level === "Extreme";
  const prior =
    priorPercentile != null && Number.isFinite(priorPercentile) ? priorPercentile : null;
  const marker =
    scale.percentile != null && Number.isFinite(scale.percentile)
      ? Math.min(100, Math.max(0, scale.percentile))
      : null;

  return (
    <div className="mt-1.5 w-[13rem] max-w-full">
      <div className="flex items-center justify-between text-[9px] font-medium text-muted-foreground">
        <span>Low</span>
        <span>High</span>
      </div>
      <div
        className="mt-1"
        style={{ paddingLeft: PERCENTILE_MARKER_PX / 2, paddingRight: PERCENTILE_MARKER_PX / 2 }}
      >
        <div
          className={[
            "relative h-[5px] rounded-full",
            marker == null
              ? "bg-muted"
              : "bg-gradient-to-r from-emerald-500/75 via-amber-400/80 to-rose-500/80",
          ].join(" ")}
          role={marker == null ? undefined : "meter"}
          aria-label={scale.label}
          aria-valuemin={marker == null ? undefined : 0}
          aria-valuemax={marker == null ? undefined : 100}
          aria-valuenow={marker == null ? undefined : Math.round(marker)}
        >
          {marker != null ? (
            <span
              className={[
                "absolute top-1/2 z-[1] block rounded-full border-2 border-background shadow-sm",
                accentExtreme ? "bg-amber-600 dark:bg-amber-400" : "bg-foreground",
              ].join(" ")}
              style={{
                left: `${marker}%`,
                width: PERCENTILE_MARKER_PX,
                height: PERCENTILE_MARKER_PX,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 leading-none">
        <span
          className={
            accentExtreme
              ? "text-[12px] font-semibold text-amber-800 dark:text-amber-300"
              : "text-[12px] font-semibold text-foreground/85"
          }
        >
          {scale.label}
        </span>
        {scale.percentile != null ? (
          <span
            className={[
              "shrink-0 tabular-nums text-[13.5px] font-bold tracking-tight",
              accentExtreme
                ? "text-amber-900 dark:text-amber-200"
                : "text-foreground",
            ].join(" ")}
          >
            {formatPercentileShort(scale.percentile)}
          </span>
        ) : null}
      </div>
      {prior != null ? (
        <p className="mt-1.5 text-[11px] font-semibold tabular-nums leading-none tracking-tight text-foreground/70">
          {formatPercentileShort(prior).replace(" percentile", "")} Percentile 1W ago
        </p>
      ) : null}
    </div>
  );
}

function PeriodChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

function PrimaryValue({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span
      className={["text-[21.6px] font-bold tabular-nums leading-none tracking-tight", tone].join(" ")}
    >
      {children}
    </span>
  );
}

/** ~10% smaller main desk icons (Risk Monitor only). */
function DeskMark({ children }: { children: ReactNode }) {
  return <span className="inline-flex origin-center scale-90">{children}</span>;
}

/**
 * Centered icon–data group inside each category.
 * Top-aligned by default so primary values share one horizontal baseline across columns.
 */
function DeskRow({
  onActivate,
  ariaLabel,
  mark,
  title,
  children,
  align = "start",
}: {
  onActivate: () => void;
  ariaLabel: string;
  mark: ReactNode;
  title: string;
  children: ReactNode;
  /** Vertical alignment inside the equal-height category cell. */
  align?: "start" | "center";
}) {
  const centered = align === "center";
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={[
        "flex h-full min-h-0 w-full cursor-pointer justify-center px-2.5 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border",
        centered ? "items-center py-2.5" : "items-start pt-2.5 pb-2",
      ].join(" ")}
      aria-label={ariaLabel}
    >
      <div
        className={[
          "grid w-full max-w-[19.5rem] grid-cols-[auto_minmax(0,1fr)] gap-x-3",
          centered ? "items-center" : "items-start",
        ].join(" ")}
      >
        <div
          className={[
            "flex w-[4.5rem] shrink-0 flex-col items-center gap-1",
            centered ? "" : "pt-0.5",
          ].join(" ")}
        >
          <span className="max-w-full truncate text-center text-[10.8px] font-medium leading-none tracking-normal text-foreground">
            {title}
          </span>
          {mark}
        </div>
        <div className={centered ? "min-w-0" : "min-w-0 pt-0.5"}>{children}</div>
      </div>
    </article>
  );
}

function PriceOrVolObservation({
  signal,
  onSelect,
}: {
  signal: CommoditySignal;
  onSelect: (signal: CommoditySignal) => void;
}) {
  const display = signal.display;
  const isVol = signal.category === "highest-volatility";
  const primaryTone = isVol ? "text-foreground" : toneClass(signal.primaryValue);
  const priorPercentile =
    display.viz.kind === "regime-compare" ? display.viz.priorPercentile : null;

  return (
    <DeskRow
      onActivate={() => onSelect(signal)}
      ariaLabel={`${display.headline}: ${signal.commodityName} ${signal.primaryReading}. Open analysis.`}
      title={signal.commodityName}
      mark={
        <DeskMark>
          <InstrumentMark id={signal.commodityId} size="xl" />
        </DeskMark>
      }
    >
      <div className="flex h-6 items-baseline gap-x-2">
        <PrimaryValue tone={primaryTone}>{signal.primaryReading}</PrimaryValue>
        {!isVol ? <PeriodChip>{display.metricLabel}</PeriodChip> : null}
      </div>
      <SignificanceMeter
        scale={display.significanceScale}
        priorPercentile={priorPercentile}
      />
    </DeskRow>
  );
}

function CurrencyObservation({
  signal,
  onSelect,
}: {
  signal: CommoditySignal;
  onSelect: (signal: CommoditySignal) => void;
}) {
  const viz = signal.display.viz.kind === "currency-pair" ? signal.display.viz : null;
  if (!viz) return null;

  const pairDef = viz.pair === "USD/SEK" ? getFxPair("usdsek") : getFxPair("eursek");
  const costLabel =
    viz.costDirection === "higher"
      ? "Higher SEK costs"
      : viz.costDirection === "lower"
        ? "Lower SEK costs"
        : "Unchanged SEK costs";

  return (
    <DeskRow
      onActivate={() => onSelect(signal)}
      ariaLabel={`${viz.pair} ${signal.primaryReading}. ${costLabel}. Open analysis.`}
      title={viz.pair}
      mark={
        pairDef ? (
          <DeskMark>
            <FxPairFlags pair={pairDef} size="lg" />
          </DeskMark>
        ) : null
      }
      align="center"
    >
      <div className="flex items-center gap-x-2">
        <div className="min-w-0">
          <div className="flex h-6 items-baseline gap-x-2">
            <PrimaryValue tone={costToneClass(viz.costDirection)}>
              {signal.primaryReading}
            </PrimaryValue>
            <PeriodChip>{signal.display.metricLabel}</PeriodChip>
          </div>
          <p
            className={[
              "mt-2 text-[12px] font-semibold leading-none tracking-tight",
              costToneClass(viz.costDirection),
            ].join(" ")}
          >
            {costLabel}
          </p>
        </div>
        <div className="ml-3 flex shrink-0 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {viz.pair.startsWith("USD") ? "USD-Exposure" : "EUR-Exposure"}
          </span>
          {viz.representatives.map((rep) => (
            <span
              key={rep.id}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80"
              title={
                viz.denominationNames.length
                  ? `${viz.pair} denominated: ${viz.denominationNames.join(", ")}`
                  : rep.name
              }
            >
              <InstrumentMark id={rep.id} size="sm" />
              {rep.name}
            </span>
          ))}
        </div>
      </div>
    </DeskRow>
  );
}

function ForwardObservation({
  signal,
  onSelect,
}: {
  signal: CommoditySignal;
  onSelect: (signal: CommoditySignal) => void;
}) {
  const viz = signal.display.viz.kind === "forward-repricing" ? signal.display.viz : null;
  if (!viz) return null;

  return (
    <DeskRow
      onActivate={() => onSelect(signal)}
      ariaLabel={`${signal.commodityName} 6M ${signal.primaryReading}. Open curve analysis.`}
      title={signal.commodityName}
      mark={
        <DeskMark>
          <InstrumentMark id={signal.commodityId} size="xl" />
        </DeskMark>
      }
    >
      <div className="flex h-6 items-baseline gap-x-2">
        <PeriodChip className="text-[12px] tracking-[0.08em]">6M</PeriodChip>
        <PrimaryValue tone={toneClass(viz.sixMonthRet)}>{signal.primaryReading}</PrimaryValue>
      </div>
      <div className="mt-2 mb-2 h-px w-[13rem] max-w-full bg-border" aria-hidden />
      <p className="flex items-baseline gap-x-1.5 tabular-nums leading-none">
        <span className="text-[12px] font-semibold tracking-tight text-muted-foreground">
          Front-month
        </span>
        <span
          className={["text-[13.5px] font-bold tracking-tight", toneClass(viz.frontMonthRet)].join(
            " ",
          )}
        >
          {signal.contextReading.replace(/^Front-month\s+/, "")}
        </span>
      </p>
    </DeskRow>
  );
}

function CategoryColumn({
  category,
  signals,
  onSelectSignal,
}: {
  category: SignalCategory;
  signals: CommoditySignal[];
  onSelectSignal: (signal: CommoditySignal) => void;
}) {
  const heading = SIGNAL_CATEGORY_LABELS[category] ?? signals[0]?.categoryLabel ?? category;
  const rows = signals.slice(0, 2);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-center gap-1 border-b border-border bg-muted/20 px-1.5">
        <h3 className="whitespace-nowrap text-center text-[10.8px] font-medium tracking-normal text-foreground">
          {heading}
        </h3>
        {category === "largest-price-move" ? (
          <CommodityInfo label="About highest price move percentiles" side="bottom" wide>
            <p className="leading-snug text-muted-foreground">
              Ranks commodities by how unusual their daily price movements are compared to their own
              historical daily movements. The two commodities with the highest percentiles are
              displayed.
            </p>
          </CommodityInfo>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-border">
        {rows.map((signal) => {
          if (signal.category === "currency-impact") {
            return (
              <CurrencyObservation key={signal.id} signal={signal} onSelect={onSelectSignal} />
            );
          }
          if (signal.category === "forward-repricing") {
            return (
              <ForwardObservation key={signal.id} signal={signal} onSelect={onSelectSignal} />
            );
          }
          return (
            <PriceOrVolObservation key={signal.id} signal={signal} onSelect={onSelectSignal} />
          );
        })}
      </div>
    </div>
  );
}

function columnGridClass(count: number): string {
  if (count <= 1) return "grid grid-cols-1 divide-y divide-border";
  if (count === 2) {
    return "grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0";
  }
  if (count === 3) {
    return "grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-3 lg:divide-y-0";
  }
  return "grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0";
}

export function CommodityMarketSignals({
  payload,
  pending,
  error,
  onSelectSignal,
}: {
  payload: CommoditySignalsPayload | undefined;
  pending: boolean;
  error: string | null;
  onSelectSignal: (signal: CommoditySignal) => void;
}) {
  const signals = payload?.signals ?? [];

  const categories = SIGNAL_CATEGORY_ORDER.filter((category) =>
    signals.some((signal) => signal.category === category),
  ).map((category) => ({
    category,
    signals: signals.filter((signal) => signal.category === category),
  }));

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3.5 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
            Commodity Risk Monitor
          </h2>
          <div className="ml-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Info
              className="size-3.5 shrink-0 text-muted-foreground/80"
              strokeWidth={2}
              aria-hidden
            />
            <p className="min-w-0 text-[11px] font-medium leading-none tracking-tight text-muted-foreground">
              Highlights the most notable market movements across monitored commodities.
            </p>
          </div>
        </div>
      </header>

      {pending && !payload ? (
        <div className="flex h-24 items-center justify-center">
          <YieldCurveFetchSpinner label="Loading market signals" />
        </div>
      ) : error && !payload ? (
        <p className="px-3.5 py-2.5 text-[13px] text-muted-foreground">Data unavailable. {error}</p>
      ) : payload?.coverageInsufficient && signals.length === 0 ? (
        <p className="px-3.5 py-2.5 text-[13px] text-muted-foreground">
          Insufficient historical coverage to evaluate market signals.
        </p>
      ) : signals.length === 0 ? (
        <div className="px-3.5 py-3">
          <p className="text-[13px] font-medium text-foreground/85">No market signals available</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Desk history or FX alignment is not yet sufficient.
          </p>
        </div>
      ) : (
        <div>
          {payload?.fromStaleCache ? (
            <p className="border-b border-border px-3.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-400">
              Cached signals — latest refresh failed.
            </p>
          ) : null}
          <div className={columnGridClass(categories.length)}>
            {categories.map(({ category, signals: columnSignals }) => (
              <CategoryColumn
                key={category}
                category={category}
                signals={columnSignals}
                onSelectSignal={onSelectSignal}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
