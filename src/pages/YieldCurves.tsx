import { useMemo, useState } from "react";
import { PageShell, Panel } from "@/components/PageShell";
import { YieldCurveChart } from "@/components/yield-curves/YieldCurveChart";
import { YieldCurveCountryChart } from "@/components/yield-curves/YieldCurveCountryChart";
import { YieldCurveCountryTable } from "@/components/yield-curves/YieldCurveCountryTable";
import { YieldCurveInterpretation } from "@/components/yield-curves/YieldCurveInterpretation";
import { YieldCurveSummaryCards } from "@/components/yield-curves/YieldCurveSummaryCards";
import { YieldCurveTable } from "@/components/yield-curves/YieldCurveTable";
import { YieldCurveDataNotes, YieldCurvePanelEmpty } from "@/components/yield-curves/YieldCurveDataNotes";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";
import { YC_CHART_HEIGHT } from "@/components/yield-curves/yieldCurvePageUi";
import { buildCountryCompareRows } from "@/lib/yieldCurves/countryCompare";
import {
  averageCurveMoveBps,
  avgLongEndChangeBps,
  avgShortEndChangeBps,
  classifyCurveMove,
  comparisonLabel,
} from "@/lib/yieldCurves/curveMath";
import {
  marketRegimeFromRows,
  relativeRegimeFromRows,
  riskSignalAtPeriod,
  riskSignalChangeFromRows,
  riskSignalComparisonFromRows,
  riskSignalFromRows,
  shortCountryLabel,
} from "@/lib/yieldCurves/riskSignal";
import {
  LIVE_SOVEREIGN_COUNTRY_OPTIONS,
  YIELD_COMPARISON_OPTIONS,
  getSovereignCountry,
} from "@/lib/yieldCurves/sovereignCountries";
import { STRUCTURALLY_MISSING_CN } from "@/lib/yieldCurves/fetchChinaChinaBondCurve";
import { STRUCTURALLY_MISSING_GB } from "@/lib/yieldCurves/fetchUkBankOfEnglandCurve";
import { STRUCTURALLY_MISSING_NO } from "@/lib/yieldCurves/fetchNorwayNorgesBankCurve";
import { STRUCTURALLY_MISSING_SE } from "@/lib/yieldCurves/fetchSwedenDiCurve";
import type {
  SovereignCountryId,
  YieldComparisonId,
  YieldCurveViewMode,
  YieldMaturity,
} from "@/lib/yieldCurves/types";
import { useChinaChinaBondYieldCurve } from "@/lib/yieldCurves/useChinaChinaBondYieldCurve";
import { useUkBankOfEnglandYieldCurve } from "@/lib/yieldCurves/useUkBankOfEnglandYieldCurve";
import { useNorwayNorgesBankYieldCurve } from "@/lib/yieldCurves/useNorwayNorgesBankYieldCurve";
import { useSwedenDiYieldCurve } from "@/lib/yieldCurves/useSwedenDiYieldCurve";
import { useUsTreasuryYieldCurve } from "@/lib/yieldCurves/useUsTreasuryYieldCurve";

const VIEW_MODE_OPTIONS: { id: YieldCurveViewMode; label: string }[] = [
  { id: "time", label: "Time comparison" },
  { id: "country", label: "Country comparison" },
];

const CONTROL_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

const CONTROL_SELECT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground shadow-sm";

const CONTROL_MODE_BTN =
  "flex-1 px-3 text-[13px] font-medium transition-colors";

function nextLiveCountry(exclude: SovereignCountryId): SovereignCountryId {
  return LIVE_SOVEREIGN_COUNTRY_OPTIONS.find((c) => c.id !== exclude)?.id ?? "US";
}

function sovereignLabel(id: SovereignCountryId): string {
  return getSovereignCountry(id).label;
}

function structurallyMissingFor(id: SovereignCountryId): readonly YieldMaturity[] {
  switch (id) {
    case "SE":
      return STRUCTURALLY_MISSING_SE;
    case "NO":
      return STRUCTURALLY_MISSING_NO;
    case "GB":
      return STRUCTURALLY_MISSING_GB;
    case "CN":
      return STRUCTURALLY_MISSING_CN;
    default:
      return [];
  }
}

export default function YieldCurvesPage() {
  const [viewMode, setViewMode] = useState<YieldCurveViewMode>("time");
  const [countryId, setCountryId] = useState<SovereignCountryId>("US");
  const [comparisonId, setComparisonId] = useState<YieldComparisonId>("Today");
  const [primaryCountryId, setPrimaryCountryId] = useState<SovereignCountryId>("US");
  const [compareCountryId, setCompareCountryId] = useState<SovereignCountryId>("SE");

  const isCountryMode = viewMode === "country";

  const countryModeUses = (id: SovereignCountryId) =>
    isCountryMode && (primaryCountryId === id || compareCountryId === id);

  const usQ = useUsTreasuryYieldCurve(
    comparisonId,
    countryId === "US" || countryModeUses("US"),
  );
  const seQ = useSwedenDiYieldCurve(
    comparisonId,
    countryId === "SE" || countryModeUses("SE"),
  );
  const noQ = useNorwayNorgesBankYieldCurve(
    comparisonId,
    countryId === "NO" || countryModeUses("NO"),
  );
  const gbQ = useUkBankOfEnglandYieldCurve(
    comparisonId,
    countryId === "GB" || countryModeUses("GB"),
  );
  const cnQ = useChinaChinaBondYieldCurve(
    comparisonId,
    countryId === "CN" || countryModeUses("CN"),
  );

  const usUi = usQ.data ?? undefined;
  const seUi = seQ.data ?? undefined;
  const noUi = noQ.data ?? undefined;
  const gbUi = gbQ.data ?? undefined;
  const cnUi = cnQ.data ?? undefined;

  const q =
    countryId === "SE"
      ? seQ
      : countryId === "NO"
        ? noQ
        : countryId === "GB"
          ? gbQ
          : countryId === "CN"
            ? cnQ
            : usQ;
  const ui =
    countryId === "SE"
      ? seUi
      : countryId === "NO"
        ? noUi
        : countryId === "GB"
          ? gbUi
          : countryId === "CN"
            ? cnUi
            : usUi;
  const primaryUi =
    primaryCountryId === "SE"
      ? seUi
      : primaryCountryId === "NO"
        ? noUi
        : primaryCountryId === "GB"
          ? gbUi
          : primaryCountryId === "CN"
            ? cnUi
            : usUi;
  const compareUi =
    compareCountryId === "SE"
      ? seUi
      : compareCountryId === "NO"
        ? noUi
        : compareCountryId === "GB"
          ? gbUi
          : compareCountryId === "CN"
            ? cnUi
            : usUi;
  const primaryQ =
    primaryCountryId === "SE"
      ? seQ
      : primaryCountryId === "NO"
        ? noQ
        : primaryCountryId === "GB"
          ? gbQ
          : primaryCountryId === "CN"
            ? cnQ
            : usQ;
  const compareQ =
    compareCountryId === "SE"
      ? seQ
      : compareCountryId === "NO"
        ? noQ
        : compareCountryId === "GB"
          ? gbQ
          : compareCountryId === "CN"
            ? cnQ
            : usQ;

  const primaryLabel = sovereignLabel(primaryCountryId);
  const compareLabel = sovereignLabel(compareCountryId);

  const handlePrimaryCountryChange = (id: SovereignCountryId) => {
    setPrimaryCountryId(id);
    if (id === compareCountryId) setCompareCountryId(nextLiveCountry(id));
  };

  const handleCompareCountryChange = (id: SovereignCountryId) => {
    setCompareCountryId(id);
    if (id === primaryCountryId) setPrimaryCountryId(nextLiveCountry(id));
  };

  const countryRows = useMemo(() => {
    if (!primaryUi?.rows.length) return [];
    return buildCountryCompareRows(primaryUi.rows, compareUi?.rows ?? [], comparisonId);
  }, [primaryUi?.rows, compareUi?.rows, comparisonId]);

  const countrySpreadBps = useMemo(
    () => (maturity: "2Y" | "10Y") =>
      countryRows.find((r) => r.maturity === maturity)?.spreadBps ?? null,
    [countryRows],
  );

  const rows = ui?.rows ?? [];

  const summaryRows = isCountryMode ? (primaryUi?.rows ?? []) : rows;

  const timeRisk = useMemo(
    () => riskSignalFromRows(rows),
    [rows],
  );
  const timeRiskChange = useMemo(
    () => riskSignalChangeFromRows(rows, comparisonId),
    [rows, comparisonId],
  );
  const timeRiskComparison = useMemo(
    () => riskSignalComparisonFromRows(rows, comparisonId),
    [rows, comparisonId],
  );
  const marketRegime = useMemo(
    () => marketRegimeFromRows(rows, comparisonId),
    [rows, comparisonId],
  );
  const y10Row = useMemo(() => rows.find((r) => r.maturity === "10Y"), [rows]);
  const y10 = y10Row?.currentYield ?? null;
  const y10ChangeBps = comparisonId === "Today" ? null : (y10Row?.changeBps ?? null);

  const primaryRisk = useMemo(
    () => riskSignalAtPeriod(primaryUi?.rows ?? [], comparisonId),
    [primaryUi?.rows, comparisonId],
  );
  const compareRisk = useMemo(
    () => riskSignalAtPeriod(compareUi?.rows ?? [], comparisonId),
    [compareUi?.rows, comparisonId],
  );
  const relativeRegime = useMemo(
    () =>
      relativeRegimeFromRows(
        primaryUi?.rows ?? [],
        compareUi?.rows ?? [],
        shortCountryLabel(primaryCountryId, primaryLabel),
        shortCountryLabel(compareCountryId, compareLabel),
        comparisonId,
      ),
    [
      primaryUi?.rows,
      compareUi?.rows,
      primaryCountryId,
      primaryLabel,
      compareCountryId,
      compareLabel,
      comparisonId,
    ],
  );

  const interp = useMemo(
    () => (summaryRows.length ? classifyCurveMove(summaryRows) : ("Mixed move" as const)),
    [summaryRows],
  );
  const meanShift = summaryRows.length ? averageCurveMoveBps(summaryRows) : null;
  const shortAvg = summaryRows.length ? avgShortEndChangeBps(summaryRows) : null;
  const longAvg = summaryRows.length ? avgLongEndChangeBps(summaryRows) : null;

  const comparisonLegend =
    comparisonId === "Today"
      ? `Comparison (${comparisonLabel("Today")})`
      : `Comparison (${comparisonId})`;

  const curveFetching = isCountryMode
    ? primaryQ.isFetching || compareQ.isFetching
    : q.isFetching;
  const showTimeLoading = !isCountryMode && q.isFetching;
  const awaitingTime = !isCountryMode && !ui && (q.isFetching || q.isPending);
  const awaitingPrimary =
    isCountryMode && !primaryUi && (primaryQ.isFetching || primaryQ.isPending);
  const awaitingCurve = awaitingTime || awaitingPrimary;
  const compareLoadingCountry =
    isCountryMode && !compareUi && (compareQ.isFetching || compareQ.isPending);
  const summaryPending = isCountryMode ? awaitingPrimary || compareLoadingCountry : awaitingTime;

  const seUnavailableMaturities = useMemo((): YieldMaturity[] => {
    const sourceRows = isCountryMode ? (seUi?.rows ?? []) : countryId === "SE" ? rows : [];
    if (!sourceRows.length) return [];
    return sourceRows.filter((r) => r.current.sourceType === "unavailable").map((r) => r.maturity);
  }, [isCountryMode, seUi?.rows, countryId, rows]);

  const noUnavailableMaturities = useMemo((): YieldMaturity[] => {
    if (countryId !== "NO" || !rows.length) return [];
    return rows.filter((r) => r.current.sourceType === "unavailable").map((r) => r.maturity);
  }, [countryId, rows]);

  const gbUnavailableMaturities = useMemo((): YieldMaturity[] => {
    if (countryId !== "GB" || !rows.length) return [];
    return rows.filter((r) => r.current.sourceType === "unavailable").map((r) => r.maturity);
  }, [countryId, rows]);

  const cnUnavailableMaturities = useMemo((): YieldMaturity[] => {
    if (countryId !== "CN" || !rows.length) return [];
    return rows.filter((r) => r.current.sourceType === "unavailable").map((r) => r.maturity);
  }, [countryId, rows]);

  const structurallyMissing = isCountryMode
    ? [
        ...new Set([
          ...structurallyMissingFor(primaryCountryId),
          ...structurallyMissingFor(compareCountryId),
        ]),
      ]
    : countryId === "SE"
      ? STRUCTURALLY_MISSING_SE
      : countryId === "NO"
        ? STRUCTURALLY_MISSING_NO
        : countryId === "GB"
          ? STRUCTURALLY_MISSING_GB
          : countryId === "CN"
            ? STRUCTURALLY_MISSING_CN
            : [];

  const unavailableMaturities = useMemo((): YieldMaturity[] => {
    if (isCountryMode) {
      return countryRows
        .filter(
          (r) => r.primarySourceType === "unavailable" || r.compareSourceType === "unavailable",
        )
        .map((r) => r.maturity);
    }
    if (countryId === "SE") return seUnavailableMaturities;
    if (countryId === "NO") return noUnavailableMaturities;
    if (countryId === "GB") return gbUnavailableMaturities;
    if (countryId === "CN") return cnUnavailableMaturities;
    return [];
  }, [
    isCountryMode,
    countryRows,
    countryId,
    seUnavailableMaturities,
    noUnavailableMaturities,
    gbUnavailableMaturities,
    cnUnavailableMaturities,
  ]);

  const snapshot = isCountryMode ? primaryUi?.snapshot : ui?.snapshot;

  const countryLabel =
    countryId === "SE"
      ? "Sweden"
      : countryId === "NO"
        ? "Norway"
        : countryId === "GB"
          ? "United Kingdom"
          : countryId === "CN"
            ? "China"
            : "United States";

  const countryPeriodLabel =
    comparisonId === "Today" ? "current levels" : `${comparisonId} ago`;

  const chartPanelMeta = isCountryMode
    ? `${primaryLabel} vs ${compareLabel} · ${countryPeriodLabel}`
    : showTimeLoading
      ? countryLabel
      : snapshot
      ? snapshot.source === "TradingView"
        ? comparisonId === "Today"
          ? `As of ${snapshot.date} · TradingView UK Government Bond Yields · vs prior close`
          : `As of ${snapshot.date} · TradingView UK Government Bond Yields · vs TradingView ${comparisonId}`
        : `As of ${snapshot.date} · vs ${snapshot.comparisonDate}`
      : countryLabel;

  const chartEmptyState = useMemo((): { title: string; message: string } | null => {
    if (awaitingCurve) return null;

    const errQ = isCountryMode ? primaryQ : q;
    if (errQ.isError && errQ.error != null) {
      const errMsg = errQ.error instanceof Error ? errQ.error.message : String(errQ.error);
      return {
        title: `${isCountryMode ? primaryLabel : countryLabel} request failed`,
        message: errMsg,
      };
    }

    if (!isCountryMode) {
      if (ui?.dataSourceTag === "mock-fallback") {
        return {
          title: `${countryLabel} yield curve unavailable`,
          message: ui.fallbackHint ?? "Official data could not be loaded.",
        };
      }
      if (!ui) {
        const unavailableMessages: Partial<Record<SovereignCountryId, string>> = {
          SE: "Swedish market rate data (DI/Millistream) could not be loaded.",
          NO: "Official Norges Bank data could not be loaded.",
          GB: "United Kingdom yield curve data unavailable.",
          CN: "Official ChinaBond data could not be loaded.",
        };
        const msg = unavailableMessages[countryId];
        if (msg) {
          return { title: `${countryLabel} yield curve unavailable`, message: msg };
        }
      }
    }

    if (isCountryMode && !primaryUi) {
      return {
        title: `${primaryLabel} yield curve unavailable`,
        message: "Official data could not be loaded.",
      };
    }

    return null;
  }, [
    awaitingCurve,
    isCountryMode,
    primaryQ,
    q,
    primaryLabel,
    countryLabel,
    ui,
    countryId,
    primaryUi,
  ]);

  return (
    <PageShell
      title="Yield Curves"
      subtitle="Compare sovereign yield curves and track how the curve shape changes over time."
    >
      <div className="space-y-4">
        {/* Controls — consistent left-to-right grid */}
        <section className="rounded-md border border-border bg-card px-4 py-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="flex flex-col gap-1.5 sm:max-w-xl">
              <span className={CONTROL_LABEL}>View</span>
              <div className="flex h-10 overflow-hidden rounded-md border border-border shadow-sm">
                {VIEW_MODE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setViewMode(o.id)}
                    className={[
                      CONTROL_MODE_BTN,
                      viewMode === o.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground hover:bg-muted/40",
                    ].join(" ")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {isCountryMode ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="yc-primary-country" className={CONTROL_LABEL}>
                    Primary country
                  </label>
                  <select
                    id="yc-primary-country"
                    value={primaryCountryId}
                    onChange={(e) =>
                      handlePrimaryCountryChange(e.target.value as SovereignCountryId)
                    }
                    className={CONTROL_SELECT}
                  >
                    {LIVE_SOVEREIGN_COUNTRY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-4 sm:col-span-2 lg:col-span-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="yc-compare-country" className={CONTROL_LABEL}>
                      Compare country
                    </label>
                    <select
                      id="yc-compare-country"
                      value={compareCountryId}
                      onChange={(e) =>
                        handleCompareCountryChange(e.target.value as SovereignCountryId)
                      }
                      className={CONTROL_SELECT}
                    >
                      {LIVE_SOVEREIGN_COUNTRY_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="yc-country-comp" className={CONTROL_LABEL}>
                      Comparison period
                    </label>
                    <select
                      id="yc-country-comp"
                      value={comparisonId}
                      onChange={(e) => setComparisonId(e.target.value as YieldComparisonId)}
                      className={CONTROL_SELECT}
                    >
                      {YIELD_COMPARISON_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="yc-country" className={CONTROL_LABEL}>
                    Country
                  </label>
                  <select
                    id="yc-country"
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value as SovereignCountryId)}
                    className={CONTROL_SELECT}
                  >
                    {LIVE_SOVEREIGN_COUNTRY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="yc-comp" className={CONTROL_LABEL}>
                    Comparison period
                  </label>
                  <select
                    id="yc-comp"
                    value={comparisonId}
                    onChange={(e) => setComparisonId(e.target.value as YieldComparisonId)}
                    className={CONTROL_SELECT}
                  >
                    {YIELD_COMPARISON_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </section>

        {isCountryMode ? (
          <YieldCurveSummaryCards
            variant="country"
            comparisonId={comparisonId}
            primaryCountryId={primaryCountryId}
            compareCountryId={compareCountryId}
            primaryLabel={primaryLabel}
            compareLabel={compareLabel}
            primaryRiskBps={primaryRisk.bps}
            compareRiskBps={compareRisk.bps}
            primaryRiskInsufficient={primaryRisk.insufficient}
            compareRiskInsufficient={compareRisk.insufficient}
            spread10Bps={countrySpreadBps("10Y")}
            relativeRegime={relativeRegime}
            pending={summaryPending}
          />
        ) : (
          <YieldCurveSummaryCards
            variant="time"
            comparisonId={comparisonId}
            countryId={countryId}
            countryLabel={countryLabel}
            marketRegime={marketRegime}
            riskSignalBps={timeRisk.bps}
            riskSignalComparisonBps={timeRiskComparison}
            riskSignalInsufficient={timeRisk.insufficient}
            riskSignalChangeBps={timeRiskChange}
            y10={y10}
            y10ChangeBps={y10ChangeBps}
            fetching={showTimeLoading}
          />
        )}

        <Panel title="Yield curve" meta={chartPanelMeta}>
          {chartEmptyState ? (
            <YieldCurvePanelEmpty
              title={chartEmptyState.title}
              message={chartEmptyState.message}
            />
          ) : curveFetching ? (
            <div className="flex items-center justify-center" style={{ height: YC_CHART_HEIGHT }}>
              <YieldCurveFetchSpinner />
            </div>
          ) : isCountryMode ? (
            primaryUi ? (
              <YieldCurveCountryChart
                rows={countryRows}
                primaryLabel={primaryLabel}
                compareLabel={compareLabel}
                compareLoading={compareLoadingCountry}
                periodLabel={countryPeriodLabel}
              />
            ) : (
              <div style={{ height: YC_CHART_HEIGHT }} />
            )
          ) : rows.length ? (
            <YieldCurveChart rows={rows} comparisonName={comparisonLegend} scaleMode="auto" />
          ) : (
            <div style={{ height: YC_CHART_HEIGHT }} />
          )}
        </Panel>

        <Panel
          title="Curve levels"
          meta={
            isCountryMode
              ? `Yields and ${primaryLabel} minus ${compareLabel} spread (${countryPeriodLabel})`
              : "Current vs comparison yields (basis points)"
          }
        >
          {chartEmptyState ? (
            <YieldCurvePanelEmpty
              title={chartEmptyState.title}
              message={chartEmptyState.message}
            />
          ) : isCountryMode ? (
            <YieldCurveCountryTable
              rows={countryRows}
              primaryLabel={primaryLabel}
              compareLabel={compareLabel}
              compareLoading={compareLoadingCountry}
              fetching={curveFetching}
              periodLabel={countryPeriodLabel}
            />
          ) : (
            <YieldCurveTable rows={rows} fetching={showTimeLoading} />
          )}
        </Panel>

        {!isCountryMode && rows.length && !showTimeLoading ? (
          <YieldCurveInterpretation
            label={interp}
            meanBps={meanShift}
            shortEndBps={shortAvg}
            longEndBps={longAvg}
          />
        ) : null}

        <YieldCurveDataNotes
          structurallyMissing={structurallyMissing}
          unavailableMaturities={unavailableMaturities}
          coverageNote={
            countryId === "SE"
              ? "Sweden: 1M/3M/6M treasury bills from Riksbank SWEA (official, T+1). 2Y/5Y/10Y/30Y from DI/Millistream (~15 min delayed). 1Y is not published."
              : countryId === "GB"
                ? gbUi?.dataSourceTag === "boe-fallback"
                  ? "TradingView UK government bond yields were unavailable. This curve is the latest Bank of England nominal gilt zero-coupon spot curve."
                  : "Current curve and 1D, 1W, 1M, 3M, and 1Y comparisons use TradingView UK government bond benchmark yields for the same symbols. A missing TradingView history point is left unavailable. Bank of England zero-coupon spot yields are not mixed into these changes."
                : undefined
          }
        />
      </div>
    </PageShell>
  );
}
