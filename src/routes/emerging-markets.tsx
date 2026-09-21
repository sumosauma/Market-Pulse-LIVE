import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/emerging-markets")({
  head: () => ({
    meta: [
      { title: "Emerging Markets — Market Pulse AI" },
      { name: "description", content: "Emerging markets overview." },
    ],
  }),
  component: EmergingMarketsPage,
});

function EmergingMarketsPage() {
  return (
    <PageShell title="Emerging Markets" subtitle="Coming soon">
      {null}
    </PageShell>
  );
}
