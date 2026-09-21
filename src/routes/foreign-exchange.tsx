import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, Panel } from "@/components/PageShell";
import { FxLiveRatesTable } from "@/components/fx/FxLiveRatesTable";
import { FxPairChart } from "@/components/fx/FxPairChart";
import { carryForPair, type FxCarry } from "@/lib/fx/carry";
import { FX_LIVE_QUERY_KEY, fxHistoryQueryKey, getFxHistory, getFxLiveRates } from "@/lib/fx/fx.functions";
import { DEFAULT_FX_PAIR, FX_PAIRS, type FxPairId } from "@/lib/fx/pairs";
import { DEFAULT_FX_TIMEFRAME, type FxLiveRow, type FxTimeframe } from "@/lib/fx/types";
import { getPolicyRates, POLICY_RATES_QUERY_KEY } from "@/lib/policyRates/policyRates.functions";
import type { PolicyBankId, PolicyRateRow } from "@/lib/policyRates/types";

const FX_STALE_MS = 12 * 60 * 60 * 1000;

export const Route = createFileRoute("/foreign-exchange")({
  head: () => ({
    meta: [
      { title: "Foreign Exchange — Market Pulse AI" },
      { name: "description", content: "ECB daily FX reference rates and historical charts." },
    ],
  }),
  component: ForeignExchangePage,
});

function ForeignExchangePage() {
  const fetchLive = useServerFn(getFxLiveRates);
  const fetchHistory = useServerFn(getFxHistory);
  const fetchPolicyRates = useServerFn(getPolicyRates);
  const [selectedPairId, setSelectedPairId] = useState<FxPairId>(DEFAULT_FX_PAIR);
  const [timeframe, setTimeframe] = useState<FxTimeframe>(DEFAULT_FX_TIMEFRAME);

  const liveQuery = useQuery({
    queryKey: FX_LIVE_QUERY_KEY,
    queryFn: () => fetchLive(),
    staleTime: FX_STALE_MS,
  });

  const policyQuery = useQuery({
    queryKey: POLICY_RATES_QUERY_KEY,
    queryFn: () => fetchPolicyRates(),
    staleTime: 60 * 60 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: fxHistoryQueryKey(selectedPairId, timeframe),
    queryFn: () => fetchHistory({ data: { pairId: selectedPairId, timeframe } }),
    staleTime: FX_STALE_MS,
  });

  const rowsById = useMemo(() => {
    const out: Partial<Record<FxPairId, FxLiveRow>> = {};
    for (const row of liveQuery.data?.rows ?? []) {
      out[row.pairId] = row;
    }
    return out;
  }, [liveQuery.data]);

  const pendingIds = useMemo(() => {
    if (!liveQuery.isPending || liveQuery.data) return new Set<FxPairId>();
    return new Set(FX_PAIRS.map((p) => p.id));
  }, [liveQuery.data, liveQuery.isPending]);

  const policyByBank = useMemo(() => {
    const map = new Map<PolicyBankId, PolicyRateRow>();
    for (const row of policyQuery.data?.rows ?? []) map.set(row.id, row);
    return map;
  }, [policyQuery.data]);

  const carryById = useMemo(() => {
    const out: Partial<Record<FxPairId, FxCarry>> = {};
    if (!policyQuery.data) return out;
    for (const pair of FX_PAIRS) out[pair.id] = carryForPair(pair, policyByBank);
    return out;
  }, [policyByBank, policyQuery.data]);

  const carryPending = policyQuery.isPending && !policyQuery.data;

  const historyError =
    historyQuery.data?.error ?? (historyQuery.isError ? "Could not load chart history" : null);

  return (
    <PageShell
      title="Foreign Exchange"
      subtitle="ECB daily reference via Frankfurter · published ~16:00 CET on weekdays"
    >
      <div className="space-y-4">
        <Panel title="Live rates">
          <FxLiveRatesTable
            rowsById={rowsById}
            pendingIds={pendingIds}
            selectedPairId={selectedPairId}
            onSelect={setSelectedPairId}
            carryById={carryById}
            carryPending={carryPending}
          />
        </Panel>

        <Panel title="History">
          <FxPairChart
            pairId={selectedPairId}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
            points={historyQuery.data?.points ?? []}
            isLoading={historyQuery.isLoading}
            error={historyError}
          />
        </Panel>
      </div>
    </PageShell>
  );
}
