import { createFileRoute } from "@tanstack/react-router";
import YieldCurvesPage from "@/pages/YieldCurves";

export const Route = createFileRoute("/yield-curves")({
  head: () => ({
    meta: [
      { title: "Yield Curves — Market Pulse AI" },
      { name: "description", content: "Sovereign yield curve structure and historical comparison (prototype)." },
    ],
  }),
  component: YieldCurvesPage,
});
