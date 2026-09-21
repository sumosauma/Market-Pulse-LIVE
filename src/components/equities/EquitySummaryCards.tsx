import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { fmtChangePct } from "@/lib/equities/equityMarketsUi";
import { mapPctColor } from "@/lib/equities/equityMapStyle";
import type {
  EquitySummaryLeader,
  EquitySummaryPeriodStats,
  EquitySummaryStats,
} from "@/lib/equities/equityMarketsUi";

const CARD =
  "rounded-xl bg-secondary/35 px-4 py-3.5 ring-1 ring-border/40 backdrop-blur-[2px]";

const CARD_HEADING =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

const PERIOD_LABEL =
  "text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80";

const PCT_VALUE =
  "font-mono text-[18px] font-semibold tabular-nums tracking-tight leading-none sm:text-[19px]";

const STAT_VALUE =
  "font-mono text-[17px] font-semibold tabular-nums tracking-tight text-foreground";

function DualSummaryCard({
  title,
  left,
  right,
}: {
  title: string;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className={CARD_HEADING}>{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-6">
        {left}
        {right}
      </div>
    </div>
  );
}

function PeriodColumn({
  periodLabel,
  children,
}: {
  periodLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className={PERIOD_LABEL}>{periodLabel}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function LeaderStat({
  leader,
  onSelectCountry,
}: {
  leader: EquitySummaryLeader | null;
  onSelectCountry: (countryId: string) => void;
}) {
  if (!leader) {
    return <div className={STAT_VALUE}>—</div>;
  }

  const pct = fmtChangePct(leader.changePercent);
  const tooltip = `${leader.row.countryName} · ${leader.row.indexName} · ${pct}`;

  return (
    <button
      type="button"
      title={tooltip}
      className="group w-full min-w-0 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-muted/25"
      onClick={() => onSelectCountry(leader.row.countryId)}
    >
      <div className="flex items-center gap-2">
        <EquityCountryFlag countryId={leader.row.countryId} size="sm" />
        <span className={PCT_VALUE} style={{ color: mapPctColor(leader.changePercent) }}>
          {pct}
        </span>
      </div>
      <div className="mt-1.5 truncate text-[13px] font-semibold leading-tight text-foreground group-hover:underline sm:text-[14px]">
        {leader.row.countryName}
      </div>
      <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground sm:text-[12px]">
        {leader.row.indexName}
      </p>
    </button>
  );
}

function AverageStat({ stats }: { stats: EquitySummaryPeriodStats }) {
  const value = stats.averageMove !== null ? fmtChangePct(stats.averageMove) : "—";
  return (
    <div
      className={STAT_VALUE}
      style={stats.averageMove !== null ? { color: mapPctColor(stats.averageMove) } : undefined}
    >
      {value}
    </div>
  );
}

function BreadthStat({ stats }: { stats: EquitySummaryPeriodStats }) {
  const value =
    stats.liveCount > 0
      ? `${stats.positiveCount} up · ${stats.negativeCount} down`
      : "—";

  return <div className={STAT_VALUE}>{value}</div>;
}

export function EquitySummaryCards({
  summary,
  onSelectCountry,
}: {
  summary: EquitySummaryStats;
  onSelectCountry: (countryId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DualSummaryCard
        title="Best market"
        left={
          <PeriodColumn periodLabel="Today">
            <LeaderStat leader={summary.day.best} onSelectCountry={onSelectCountry} />
          </PeriodColumn>
        }
        right={
          <PeriodColumn periodLabel="This month">
            <LeaderStat leader={summary.month.best} onSelectCountry={onSelectCountry} />
          </PeriodColumn>
        }
      />

      <DualSummaryCard
        title="Worst market"
        left={
          <PeriodColumn periodLabel="Today">
            <LeaderStat leader={summary.day.worst} onSelectCountry={onSelectCountry} />
          </PeriodColumn>
        }
        right={
          <PeriodColumn periodLabel="This month">
            <LeaderStat leader={summary.month.worst} onSelectCountry={onSelectCountry} />
          </PeriodColumn>
        }
      />

      <DualSummaryCard
        title="Average global move"
        left={
          <PeriodColumn periodLabel="Today">
            <AverageStat stats={summary.day} />
          </PeriodColumn>
        }
        right={
          <PeriodColumn periodLabel="This month">
            <AverageStat stats={summary.month} />
          </PeriodColumn>
        }
      />

      <DualSummaryCard
        title="Market breadth"
        left={
          <PeriodColumn periodLabel="Today">
            <BreadthStat stats={summary.day} />
          </PeriodColumn>
        }
        right={
          <PeriodColumn periodLabel="This month">
            <BreadthStat stats={summary.month} />
          </PeriodColumn>
        }
      />
    </div>
  );
}
