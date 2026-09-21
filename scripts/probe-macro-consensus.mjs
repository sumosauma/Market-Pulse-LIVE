import { fetchConsensusForObservation } from "../src/lib/macroPulse/investingConsensus.ts";

const cases = [
  ["us-core-cpi", "2026-05-01", 2.9],
  ["us-core-pce", "2026-04-01", 3.3],
  ["ea-core-hicp", "2026-05-01", 2.5],
  ["se-kpif", "2026-05-01", 1.5],
];

for (const [id, obs, yoy] of cases) {
  const r = await fetchConsensusForObservation(id, obs, yoy);
  console.log(id, obs, "forecast", r.forecastDisplay, "surprise", r.surpriseDisplay);
}
