import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { FxG10Board } from "@/components/fx/FxG10Board";
import { FxMonitor } from "@/components/fx/FxMonitor";
import { FxPriceHistory, type FxPriceWindow } from "@/components/fx/FxPriceHistory";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FxDeskPeriod } from "@/lib/fx/desk";
import { useFxDeskMarket } from "@/lib/fx/useFxDesk";
import type { FxPairId } from "@/lib/fx/pairs";
import { getPolicyRates, POLICY_RATES_QUERY_KEY } from "@/lib/policyRates/policyRates.functions";
import type { PolicyBankId, PolicyRateRow } from "@/lib/policyRates/types";

export const Route = createFileRoute("/foreign-exchange")({
  head: () => ({
    meta: [
      { title: "Foreign Exchange — Market Pulse AI" },
      { name: "description", content: "G10 currency strength, FX monitor and price history." },
    ],
  }),
  component: ForeignExchangePage,
});

function ForeignExchangePage() {
  const fetchPolicyRates = useServerFn(getPolicyRates);
  const market = useFxDeskMarket();
  const [g10Period, setG10Period] = useState<FxDeskPeriod>("1M");
  const [selectedPairId, setSelectedPairId] = useState<FxPairId>("eursek");
  const [chartWindow, setChartWindow] = useState<FxPriceWindow>("3M");

  const policyQuery = useQuery({
    queryKey: POLICY_RATES_QUERY_KEY,
    queryFn: () => fetchPolicyRates(),
    staleTime: 60 * 60 * 1000,
  });

  const policyByBank = useMemo(() => {
    const map = new Map<PolicyBankId, PolicyRateRow>();
    for (const row of policyQuery.data?.rows ?? []) map.set(row.id, row);
    return map;
  }, [policyQuery.data]);

  const marketLoading = market.isPending && !market.data;
  const marketFailed = market.isError && !market.data;

  return (
    <PageShell
      title="Foreign Exchange"
      subtitle="ECB daily reference via Frankfurter · policy rates from the existing central-bank panel"
    >
      <TooltipProvider delayDuration={100}>
        <div className="space-y-4">
          <FxG10Board period={g10Period} onPeriod={setG10Period} />
          <FxMonitor
            market={market.data}
            loading={marketLoading}
            failed={marketFailed}
            policyByBank={policyByBank}
            policyPending={policyQuery.isPending && !policyQuery.data}
            selectedPairId={selectedPairId}
            onSelect={setSelectedPairId}
          />
          <FxPriceHistory
            market={market.data}
            loading={marketLoading}
            pairId={selectedPairId}
            onPair={setSelectedPairId}
            window={chartWindow}
            onWindow={setChartWindow}
          />
        </div>
      </TooltipProvider>
    </PageShell>
  );
}
