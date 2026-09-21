import type { SovereignCountryId, YieldComparisonId } from "@/lib/yieldCurves/types";
import {
  comparisonPeriodAgoLabel,
  curveRiskDiffLine,
  fmtRiskBps,
  fmtYieldPct,
  marketRegimeExplanation,
  marketRegimeMoveDetail,
  relativeRegimeGapDetail,
  RELATIVE_REGIME_EXPLANATION,
  riskSignalChangeLine,
  RISK_SIGNAL_NOT_ENOUGH,
  shortCountryLabel,
  type MarketRegimeView,
  type RelativeRegimeView,
} from "@/lib/yieldCurves/riskSignal";
import {
  CountryIdentityLine,
  CountryPairLine,
  SovereignCountryFlag,
} from "@/components/yield-curves/SovereignCountryFlag";
import {
  riskSignalInterpretation,
  YieldCurveRiskSignalScale,
  type RiskSignalScaleMarker,
} from "@/components/yield-curves/YieldCurveRiskSignalScale";

const CARD =
  "rounded-sm border border-border bg-card/80 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]";

const CARD_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

const CARD_VALUE =
  "mt-1.5 font-mono text-[17px] font-semibold tabular-nums tracking-tight text-foreground";

const CARD_REGIME_VALUE =
  "mt-1.5 text-[15px] font-semibold tracking-tight text-foreground";

const CARD_EXPLANATION =
  "mt-1.5 text-[11px] leading-snug text-muted-foreground";

const CARD_FOOTER =
  "mt-2 text-[10px] font-medium tracking-wide text-muted-foreground";

const CARD_DETAIL =
  "mt-1 text-[10px] tabular-nums leading-snug text-muted-foreground/90";

function MetricCard({
  title,
  value,
  subtext,
  detail,
  footer,
  header,
  children,
}: {
  title: string;
  value: string;
  subtext?: string;
  detail?: string;
  footer?: string;
  header?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>{title}</div>
      {header}
      <div className={CARD_VALUE}>{value}</div>
      {subtext ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
      ) : null}
      {detail ? <p className={CARD_DETAIL}>{detail}</p> : null}
      {children}
      {footer ? <p className={CARD_FOOTER}>{footer}</p> : null}
    </div>
  );
}

function CountryValueRow({
  countryId,
  label,
  value,
}: {
  countryId?: SovereignCountryId;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-none">
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
        {countryId ? <SovereignCountryFlag countryId={countryId} /> : null}
        <span>{label}</span>
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function CurrentRiskSignalCard({
  title,
  countryId,
  countryLabel,
  bps,
  insufficient,
}: {
  title: string;
  countryId: SovereignCountryId;
  countryLabel: string;
  bps: number | null;
  insufficient: boolean;
}) {
  const markers: RiskSignalScaleMarker[] =
    !insufficient && bps !== null ? [{ bps, role: "primary" }] : [];

  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>{title}</div>
      <CountryIdentityLine countryId={countryId} label={countryLabel} />
      <div className={CARD_VALUE}>{insufficient ? "—" : fmtRiskBps(bps)}</div>
      {insufficient ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{RISK_SIGNAL_NOT_ENOUGH}</p>
      ) : null}
      {!insufficient && bps !== null ? (
        <p className={CARD_FOOTER}>{riskSignalInterpretation(bps)}</p>
      ) : null}
      {!insufficient ? <YieldCurveRiskSignalScale markers={markers} /> : null}
    </div>
  );
}

function TimeRiskComparisonCard({
  comparisonId,
  currentBps,
  comparisonBps,
  changeBps,
  insufficient,
}: {
  comparisonId: YieldComparisonId;
  currentBps: number | null;
  comparisonBps: number | null;
  changeBps: number | null;
  insufficient: boolean;
}) {
  if (insufficient) {
    return (
      <MetricCard
        title="2Y–10Y spread comparison"
        value="—"
        subtext={RISK_SIGNAL_NOT_ENOUGH}
      />
    );
  }

  if (comparisonId === "Today") {
    return (
      <MetricCard
        title="2Y–10Y spread comparison"
        value="—"
        subtext="Select a comparison period to see movement"
      />
    );
  }

  const agoLabel = comparisonPeriodAgoLabel(comparisonId);
  const markers: RiskSignalScaleMarker[] = [];
  if (currentBps !== null) {
    markers.push({ bps: currentBps, label: "Today", role: "primary" });
  }
  if (comparisonBps !== null) {
    markers.push({ bps: comparisonBps, label: agoLabel, role: "compare" });
  }

  const changeLine =
    changeBps !== null ? riskSignalChangeLine(changeBps) : "—";

  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>2Y–10Y spread comparison</div>
      <div className="mt-2 space-y-1.5">
        <CountryValueRow label="Today" value={fmtRiskBps(currentBps)} />
        <CountryValueRow label={agoLabel} value={fmtRiskBps(comparisonBps)} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{changeLine}</p>
      {markers.length ? (
        <YieldCurveRiskSignalScale markers={markers} showLegend />
      ) : null}
    </div>
  );
}

function MarketRegimeCard({
  countryId,
  countryLabel,
  regime,
}: {
  countryId: SovereignCountryId;
  countryLabel: string;
  regime: MarketRegimeView;
}) {
  if (regime.state === "insufficient") {
    return (
      <MetricCard
        title="Market regime"
        value="—"
        subtext={RISK_SIGNAL_NOT_ENOUGH}
      />
    );
  }

  if (regime.state === "pick-period") {
    return (
      <div className={CARD}>
        <div className={CARD_TITLE}>Market regime</div>
        <CountryIdentityLine countryId={countryId} label={countryLabel} />
        <div className={CARD_REGIME_VALUE}>Select a comparison period</div>
        <p className={CARD_EXPLANATION}>
          Choose 1D, 1W, 1M, or longer to see how the curve moved.
        </p>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>Market regime</div>
      <CountryIdentityLine countryId={countryId} label={countryLabel} />
      <div className={CARD_REGIME_VALUE}>{regime.regime}</div>
      <p className={CARD_DETAIL}>
        {marketRegimeMoveDetail(regime.move2yBps, regime.move10yBps)}
      </p>
      <p className={CARD_EXPLANATION}>{marketRegimeExplanation(regime.regime)}</p>
    </div>
  );
}

function CountryCurveComparisonCard({
  primaryCountryId,
  compareCountryId,
  primaryLabel,
  compareLabel,
  primaryBps,
  compareBps,
  compareInsufficient,
}: {
  primaryCountryId: SovereignCountryId;
  compareCountryId: SovereignCountryId;
  primaryLabel: string;
  compareLabel: string;
  primaryBps: number | null;
  compareBps: number | null;
  compareInsufficient: boolean;
}) {
  if (compareInsufficient) {
    return (
      <MetricCard
        title="2Y–10Y spread comparison"
        value="—"
        subtext={RISK_SIGNAL_NOT_ENOUGH}
      />
    );
  }

  const diffLine = curveRiskDiffLine(primaryBps, compareBps, primaryLabel, compareLabel);

  const markers: RiskSignalScaleMarker[] = [];
  if (primaryBps !== null) {
    markers.push({ bps: primaryBps, label: primaryLabel, role: "primary" });
  }
  if (compareBps !== null) {
    markers.push({ bps: compareBps, label: compareLabel, role: "compare" });
  }

  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>2Y–10Y spread comparison</div>
      <div className="mt-2 space-y-1.5">
        <CountryValueRow
          countryId={primaryCountryId}
          label={primaryLabel}
          value={fmtRiskBps(primaryBps)}
        />
        <CountryValueRow
          countryId={compareCountryId}
          label={compareLabel}
          value={fmtRiskBps(compareBps)}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{diffLine}</p>
      <YieldCurveRiskSignalScale markers={markers} showLegend />
    </div>
  );
}

function RelativeRegimeCard({
  primaryCountryId,
  compareCountryId,
  primaryLabel,
  compareLabel,
  regime,
}: {
  primaryCountryId: SovereignCountryId;
  compareCountryId: SovereignCountryId;
  primaryLabel: string;
  compareLabel: string;
  regime: RelativeRegimeView;
}) {
  if (regime.state === "insufficient") {
    return (
      <MetricCard
        title="Relative regime"
        value="—"
        subtext={RISK_SIGNAL_NOT_ENOUGH}
      />
    );
  }

  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>Relative regime</div>
      <CountryPairLine
        primaryCountryId={primaryCountryId}
        primaryLabel={primaryLabel}
        compareCountryId={compareCountryId}
        compareLabel={compareLabel}
      />
      <div className={CARD_REGIME_VALUE}>{regime.steeperLine}</div>
      <p className={CARD_DETAIL}>Slope gap {fmtRiskBps(regime.slopeGapBps)}</p>
      <p className={CARD_DETAIL}>
        {relativeRegimeGapDetail(regime.gap10yBps, regime.gap2yBps)}
      </p>
      <p className={CARD_EXPLANATION}>{RELATIVE_REGIME_EXPLANATION}</p>
    </div>
  );
}

type TimeSummaryProps = {
  variant: "time";
  comparisonId: YieldComparisonId;
  countryId: SovereignCountryId;
  countryLabel: string;
  marketRegime: MarketRegimeView;
  riskSignalBps: number | null;
  riskSignalComparisonBps: number | null;
  riskSignalInsufficient: boolean;
  riskSignalChangeBps: number | null;
  y10: number | null;
  y10ChangeBps: number | null;
};

type CountrySummaryProps = {
  variant: "country";
  comparisonId: YieldComparisonId;
  primaryCountryId: SovereignCountryId;
  compareCountryId: SovereignCountryId;
  primaryLabel: string;
  compareLabel: string;
  primaryRiskBps: number | null;
  compareRiskBps: number | null;
  primaryRiskInsufficient: boolean;
  compareRiskInsufficient: boolean;
  spread10Bps: number | null;
  relativeRegime: RelativeRegimeView;
};

export type YieldCurveSummaryCardsProps = TimeSummaryProps | CountrySummaryProps;

function vsPeriodSuffix(comparisonId: YieldComparisonId, changeBps: number | null): string | undefined {
  if (comparisonId === "Today" || changeBps === null) return undefined;
  return `${fmtRiskBps(changeBps)} vs ${comparisonId}`;
}

export function YieldCurveSummaryCards(props: YieldCurveSummaryCardsProps) {
  if (props.variant === "country") {
    const {
      comparisonId,
      primaryCountryId,
      compareCountryId,
      primaryLabel,
      compareLabel,
      primaryRiskBps,
      compareRiskBps,
      primaryRiskInsufficient,
      compareRiskInsufficient,
      spread10Bps,
      relativeRegime,
    } = props;

    const primaryShort = shortCountryLabel(primaryCountryId, primaryLabel);
    const compareShort = shortCountryLabel(compareCountryId, compareLabel);
    const gapSub = `${primaryShort} − ${compareShort}`;
    const periodSuffix =
      comparisonId === "Today" ? "" : ` (${comparisonPeriodAgoLabel(comparisonId)})`;

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CurrentRiskSignalCard
          title={`Primary 2Y–10Y spread${periodSuffix}`}
          countryId={primaryCountryId}
          countryLabel={primaryLabel}
          bps={primaryRiskBps}
          insufficient={primaryRiskInsufficient}
        />
        <CountryCurveComparisonCard
          primaryCountryId={primaryCountryId}
          compareCountryId={compareCountryId}
          primaryLabel={primaryShort}
          compareLabel={compareShort}
          primaryBps={primaryRiskBps}
          compareBps={compareRiskBps}
          compareInsufficient={primaryRiskInsufficient || compareRiskInsufficient}
        />
        <MetricCard
          title={`10Y yield gap${periodSuffix}`}
          value={spread10Bps === null ? "—" : fmtRiskBps(spread10Bps)}
          subtext={spread10Bps === null ? RISK_SIGNAL_NOT_ENOUGH : gapSub}
          header={
            <CountryPairLine
              primaryCountryId={primaryCountryId}
              primaryLabel={primaryShort}
              compareCountryId={compareCountryId}
              compareLabel={compareShort}
            />
          }
        />
        <RelativeRegimeCard
          primaryCountryId={primaryCountryId}
          compareCountryId={compareCountryId}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
          regime={relativeRegime}
        />
      </div>
    );
  }

  const {
    comparisonId,
    countryId,
    countryLabel,
    marketRegime,
    riskSignalBps,
    riskSignalComparisonBps,
    riskSignalInsufficient,
    riskSignalChangeBps,
    y10,
    y10ChangeBps,
  } = props;

  const y10Secondary = vsPeriodSuffix(comparisonId, y10ChangeBps);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CurrentRiskSignalCard
        title="Current 2Y–10Y spread"
        countryId={countryId}
        countryLabel={countryLabel}
        bps={riskSignalBps}
        insufficient={riskSignalInsufficient}
      />
      <TimeRiskComparisonCard
        comparisonId={comparisonId}
        currentBps={riskSignalBps}
        comparisonBps={riskSignalComparisonBps}
        changeBps={riskSignalChangeBps}
        insufficient={riskSignalInsufficient}
      />
      <MetricCard
        title="10Y yield"
        value={fmtYieldPct(y10)}
        subtext={y10 === null ? RISK_SIGNAL_NOT_ENOUGH : y10Secondary}
        header={<CountryIdentityLine countryId={countryId} label={countryLabel} />}
      />
      <MarketRegimeCard
        countryId={countryId}
        countryLabel={countryLabel}
        regime={marketRegime}
      />
    </div>
  );
}
