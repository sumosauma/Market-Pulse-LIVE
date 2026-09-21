import { createFileRoute } from "@tanstack/react-router";
import EquityMarketsPage from "@/pages/EquityMarkets";

export const Route = createFileRoute("/equities")({
  head: () => ({
    meta: [
      { title: "Global Equities — Market Pulse AI" },
      {
        name: "description",
        content: "Interactive world equity heatmap showing 1D index performance by country.",
      },
    ],
  }),
  component: EquityMarketsPage,
});
