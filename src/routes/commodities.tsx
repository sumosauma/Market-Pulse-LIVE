import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CommodityDesk } from "@/components/commodities/CommodityDesk";
import { PageShell } from "@/components/PageShell";
import {
  FUTURES_CURVE_QUERY_KEY,
  getFuturesTermStructure,
} from "@/lib/commodities/futuresCurve.functions";
import {
  COMMODITY_INDICATORS_QUERY_KEY,
  getCommodityIndicators,
} from "@/lib/commodities/indicators.functions";
import {
  COMMODITY_INTRADAY_QUERY_KEY,
  getCommodityIntraday,
} from "@/lib/commodities/intraday.functions";
import {
  COMMODITIES_OVERVIEW_QUERY_KEY,
  getCommodityOverview,
} from "@/lib/commodities/overview.functions";
import {
  SECTOR_PERFORMANCE_QUERY_KEY,
  getSectorPerformance,
} from "@/lib/commodities/sectorPerformance.functions";
import {
  COMMODITY_SIGNALS_QUERY_KEY,
  getCommoditySignals,
} from "@/lib/commodities/signals.functions";

const STALE_MS = 15 * 60 * 1000;
const INTRADAY_STALE_MS = 5 * 60 * 1000;

export const Route = createFileRoute("/commodities")({
  head: () => ({
    meta: [
      { title: "Commodities — Market Pulse AI" },
      { name: "description", content: "Commodity market overview." },
    ],
  }),
  component: CommoditiesPage,
});

function CommoditiesPage() {
  const fetchOverview = useServerFn(getCommodityOverview);
  const fetchCurves = useServerFn(getFuturesTermStructure);
  const fetchIndicators = useServerFn(getCommodityIndicators);
  const fetchIntraday = useServerFn(getCommodityIntraday);
  const fetchSectors = useServerFn(getSectorPerformance);
  const fetchSignals = useServerFn(getCommoditySignals);
  const overview = useQuery({
    queryKey: COMMODITIES_OVERVIEW_QUERY_KEY,
    queryFn: () => fetchOverview(),
    staleTime: STALE_MS,
  });
  const curves = useQuery({
    queryKey: FUTURES_CURVE_QUERY_KEY,
    queryFn: () => fetchCurves(),
    staleTime: STALE_MS,
  });
  const indicators = useQuery({
    queryKey: COMMODITY_INDICATORS_QUERY_KEY,
    queryFn: () => fetchIndicators(),
    staleTime: STALE_MS,
  });
  const intraday = useQuery({
    queryKey: COMMODITY_INTRADAY_QUERY_KEY,
    queryFn: () => fetchIntraday(),
    staleTime: INTRADAY_STALE_MS,
  });
  const sectors = useQuery({
    queryKey: SECTOR_PERFORMANCE_QUERY_KEY,
    queryFn: () => fetchSectors(),
    staleTime: STALE_MS,
  });
  const signals = useQuery({
    queryKey: COMMODITY_SIGNALS_QUERY_KEY,
    queryFn: () => fetchSignals(),
    staleTime: STALE_MS,
  });

  return (
    <PageShell title="Commodities">
      <CommodityDesk
        overview={overview.data}
        curves={curves.data}
        indicators={indicators.data}
        intraday={intraday.data}
        signals={signals.data}
        overviewPending={overview.isPending}
        curvesPending={curves.isPending}
        indicatorsPending={indicators.isPending}
        intradayPending={intraday.isPending}
        signalsPending={signals.isPending}
        overviewError={overview.error instanceof Error ? overview.error.message : overview.isError ? "The commodity feed failed." : null}
        curvesError={curves.error instanceof Error ? curves.error.message : curves.isError ? "The futures curve feed failed." : null}
        signalsError={signals.error instanceof Error ? signals.error.message : signals.isError ? "The signals feed failed." : null}
        sectors={sectors.data}
        sectorsPending={sectors.isPending}
        sectorsError={sectors.error instanceof Error ? sectors.error.message : sectors.isError ? "The ETF feed failed." : null}
      />
    </PageShell>
  );
}
