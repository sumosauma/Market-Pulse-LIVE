import { useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { EquityDetailPanel } from "@/components/equities/EquityDetailPanel";
import { EquityIndexTable } from "@/components/equities/EquityIndexTable";
import { EquityMapHeatmap } from "@/components/equities/EquityMapHeatmap";
import { EquitySummaryCards } from "@/components/equities/EquitySummaryCards";
import { useElementWidth } from "@/hooks/useElementWidth";
import { fluidEquityMonitorMaxWidth } from "@/lib/equities/equityMapFluidLayout";
import { MAP_PALETTE } from "@/lib/equities/equityMapStyle";
import { useEquityMarkets } from "@/lib/equities/useEquityMarkets";

export default function EquityMarketsPage() {
  const { query, rows, summary } = useEquityMarkets();
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const layoutWidth = useElementWidth(layoutRef);

  const selectedRow = useMemo(
    () => rows.find((r) => r.countryId === selectedCountryId) ?? null,
    [rows, selectedCountryId],
  );

  const monitorMeta =
    query.isFetching && !query.data
      ? "Loading…"
      : `${rows.length} indexes`;

  const monitorMaxWidth = useMemo(
    () => fluidEquityMonitorMaxWidth(layoutWidth),
    [layoutWidth],
  );

  return (
    <PageShell
      title="Global Equities"
      subtitle="Country index performance · 1D change"
    >
      <div ref={layoutRef} className="space-y-6">
        <div
          className="mx-auto space-y-6"
          style={
            monitorMaxWidth
              ? { maxWidth: monitorMaxWidth, width: "100%" }
              : undefined
          }
        >
          <EquitySummaryCards summary={summary} onSelectCountry={setSelectedCountryId} />

          <div
            className="min-w-0 overflow-hidden rounded-2xl border bg-white"
            style={{
              borderColor: MAP_PALETTE.panelBorder,
              boxShadow: MAP_PALETTE.panelShadow,
            }}
          >
            <EquityMapHeatmap
              rows={rows}
              selectedCountryId={selectedCountryId}
              onSelectCountry={setSelectedCountryId}
              meta={monitorMeta}
            />

            <div
              className="border-t"
              style={{ borderColor: MAP_PALETTE.panelBorder }}
            >
              <EquityDetailPanel
                row={selectedRow}
                onClear={() => setSelectedCountryId(null)}
              />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl bg-card/40 ring-1 ring-border/50">
            <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                Global index table
              </h2>
              <p className="text-[11px] text-muted-foreground">
                All configured markets · sorted by 1D performance
              </p>
            </header>
            <EquityIndexTable
              rows={rows}
              selectedCountryId={selectedCountryId}
              onSelectCountry={setSelectedCountryId}
            />
          </section>
        </div>
      </div>
    </PageShell>
  );
}
