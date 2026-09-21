import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { Panel } from "@/components/PageShell";
import {
  changeToneClass,
  formatPolicyDate,
  formatUnverifiedSince,
  getPolicyRatesAsOf,
  type PolicyRateRow,
  type PolicyRatesPayload,
} from "@/lib/policyRates/policyRates";

function ChangeCell({ row }: { row: PolicyRateRow }) {
  if (!row.latestChange) {
    return <span className="text-muted-foreground">—</span>;
  }
  const date =
    row.latestChange.dateDisplay ?? formatPolicyDate(row.latestChange.dateIso ?? null);
  return (
    <span className={changeToneClass(row.latestChange.kind)}>
      <span className="block leading-tight">{row.latestChange.display}</span>
      {date !== "—" ? (
        <span className="mt-0.5 block text-[10px] font-medium tabular-nums text-muted-foreground">
          {date}
        </span>
      ) : null}
    </span>
  );
}

function NextCell({ row }: { row: PolicyRateRow }) {
  const hasLabelInDisplay =
    row.estimateLabel != null && row.nextDecisionDisplay.includes(row.estimateLabel);
  const suffix =
    row.isEstimatedDate && row.estimateLabel && !hasLabelInDisplay
      ? row.estimateLabel
      : row.isEstimatedDate && !hasLabelInDisplay
        ? "est."
        : null;
  return (
    <span className="tabular-nums text-foreground/90">
      {row.nextDecisionDisplay}
      {suffix ? <span className="ml-1 text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

function FreshnessFlag({ row }: { row: PolicyRateRow }) {
  if (row.freshness !== "unverified" && row.hasLiveSource) return null;
  const parts: string[] = [];
  if (!row.hasLiveSource) parts.push("no live source");
  if (row.freshness === "unverified") {
    parts.push(`not verified since ${formatUnverifiedSince(row.unverifiedSince)}`);
  }
  if (!parts.length) return null;
  return (
    <div className="mt-0.5 text-[10px] font-medium leading-tight text-amber-700 dark:text-amber-400">
      {parts.join(" · ")}
    </div>
  );
}

type PolicyRatesPanelProps = {
  data: PolicyRatesPayload | undefined;
  isLoading?: boolean;
};

export function PolicyRatesPanel({ data, isLoading }: PolicyRatesPanelProps) {
  const rows = data?.rows ?? [];
  const asOf = rows.length ? getPolicyRatesAsOf(rows) : "—";
  const unverifiedCount = rows.filter((r) => r.freshness === "unverified").length;

  return (
    <Panel
      title="Policy Rates"
      meta={
        unverifiedCount
          ? `key central bank rates · as of ${asOf} · ${unverifiedCount} unverified`
          : `key central bank rates · as of ${asOf}`
      }
    >
      {isLoading && !data ? (
        <div className="px-4 py-3 text-[12px] text-muted-foreground">Loading policy rates…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Bank</th>
                <th className="px-2 py-2 font-semibold">Rate</th>
                <th className="px-2 py-2 font-semibold">Last</th>
                <th className="px-4 py-2 font-semibold text-right">Next</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-start gap-2.5">
                      <EquityCountryFlag countryId={row.countryId} size="md" />
                      <div className="min-w-0">
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-primary hover:underline"
                          title={row.region}
                        >
                          {row.bankFull}{" "}
                          <span className="font-normal text-muted-foreground">({row.bankShort})</span>
                        </a>
                        {row.subtitle ? (
                          <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                            {row.subtitle}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 font-medium text-foreground">
                    <div className="tabular-nums">{row.rateDisplay ?? "—"}</div>
                    <FreshnessFlag row={row} />
                  </td>
                  <td className="px-2 py-2">
                    <ChangeCell row={row} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NextCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Live official sources where available (FRED, ECB, BoE, BoC, RBA, Riksbank, Norges Bank).
        Rows without a public API, or where a fetch failed, keep the last known value and show{" "}
        <span className="text-amber-700 dark:text-amber-400">not verified since…</span>. Not
        investment advice.
      </p>
    </Panel>
  );
}
