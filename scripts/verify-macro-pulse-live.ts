import { existsSync } from "node:fs";
import { getMacroPulsePayload } from "../src/lib/macroPulse/macroPulse.functions.ts";
import {
  fetchTeCalendarRows,
  getLastTeFetchPages,
  pickReleasedTeRow,
  pickUpcomingTeRow,
  resetTeCalendarCache,
  TE_SERIES,
  upcomingObservationMonth,
} from "../src/lib/macroPulse/teCalendar.ts";
import { consensusFromCalendarRows } from "../src/lib/macroPulse/teConsensus.ts";
import { monthKey } from "../src/lib/macroPulse/freshness.ts";
import { MACRO_INDICATOR_ORDER } from "../src/lib/macroPulse/types.ts";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

resetTeCalendarCache();
const rows = await fetchTeCalendarRows(new Date());
const pages = getLastTeFetchPages();
console.log("=== TE fetch ===");
for (const page of pages) {
  console.log(`${page.ok ? "OK" : "FAIL"} ${page.status} ${page.kind} ${page.url} rows=${page.rowCount}`);
}

const payload = await getMacroPulsePayload();
console.log("\nIndicator | Latest actual | Consensus column | Next release | Next consensus");
for (const meta of MACRO_INDICATOR_ORDER) {
  const dashRow = payload.rows.find((r) => r.id === meta.id);
  const latest = dashRow?.observationDate ?? "2026-07-01";
  const snap = await consensusFromCalendarRows(meta.id, meta.displayKind, latest, rows);
  const spec = TE_SERIES[meta.id];
  const released = dashRow?.observationDate
    ? pickReleasedTeRow(rows, spec, monthKey(dashRow.observationDate))
    : null;
  const upcoming = dashRow?.observationDate
    ? pickUpcomingTeRow(rows, spec, upcomingObservationMonth(dashRow.observationDate))
    : null;
  console.log(
    [
      meta.label,
      dashRow?.headlineValue ?? "—",
      snap.forecastDisplay ?? "—",
      dashRow?.nextReleaseDisplay ?? "—",
      snap.nextReleaseConsensusDisplay ?? "—",
    ].join(" | "),
  );
  console.log(
    `  obs=${dashRow?.observationDate ?? "—"} released=${released?.releaseDateIso ?? "—"}/${released?.reference ?? "—"} Consensus=${released?.consensus || "—"} Forecast=${released?.teForecast || "—"} upcoming=${upcoming?.releaseDateIso ?? "—"}/${upcoming?.reference ?? "—"} Consensus=${upcoming?.consensus || "—"} Forecast=${upcoming?.teForecast || "—"}`,
  );
}
