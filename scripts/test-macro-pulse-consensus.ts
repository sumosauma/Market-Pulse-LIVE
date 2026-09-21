import { readFileSync } from "node:fs";
import {
  appendForecastPoint,
  previousDistinctForecast,
  resetForecastHistoryMemory,
} from "../src/lib/macroPulse/forecastHistory.ts";
import {
  consensusFromCalendarRows,
  diagnoseConsensusPick,
  formatConsensusRevision,
} from "../src/lib/macroPulse/teConsensus.ts";
import {
  isReleasedActual,
  mergeTeCalendarRows,
  parseTeCalendarHtml,
  parseTeIndicatorCalendarHtml,
  parseTeNumeric,
  pickReleasedTeRow,
  pickUpcomingTeRow,
  referenceMonthKey,
  shouldReuseTeCalendarCache,
  TE_CALENDAR_PAGES,
  TE_SERIES,
  TE_SOURCE_URL,
  upcomingObservationMonth,
} from "../src/lib/macroPulse/teCalendar.ts";
import { filterReleasedFredObservations } from "../src/lib/macroPulse/fredSeries.ts";
import { preferNewerObservationDate, shouldReuseCachedSnapshot } from "../src/lib/macroPulse/freshness.ts";
import { MACRO_CONSENSUS_IDS } from "../src/lib/macroPulse/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const COUNTRY_HTML = `
<tr data-url="/united-states/core-pce-price-index-annual-change" data-id="399083" data-country="united states" data-category="core pce price index annual change" data-event="core pce price index yoy" data-symbol="USACPPIAC">
  <td class=' 2026-08-26'><span>12:30 PM</span></td>
  <td><table><tr><td>US</td></tr></table></td>
  <td><a class="calendar-event">Core PCE Price Index YoY</a> <span class="calendar-reference">JUL</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>3.3%</span></td>
  <td><a id='consensus'>3.3%</a></td>
  <td><a id='forecast'>3.4%</a></td>
</tr>
<tr data-url="/united-states/core-inflation-rate" data-id="398351" data-event="core inflation rate yoy">
  <td class=' 2026-09-11'><span>08:30 AM</span></td>
  <td><table><tr><td>US</td></tr></table></td>
  <td><a class="calendar-event">Core Inflation Rate YoY</a> <span class="calendar-reference">AUG</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>2.5%</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'></a></td>
</tr>
<tr data-url="/united-states/non-farm-payrolls" data-id="420972" data-event="non farm payrolls annual revision prel">
  <td class=' 2026-08-28'><span>02:00 PM</span></td>
  <td><table><tr><td>US</td></tr></table></td>
  <td><a class="calendar-event">Non Farm Payrolls Annual Revision Prel</a> <span class="calendar-reference"></span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>-911K</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'></a></td>
</tr>
<tr data-url="/united-states/non-farm-payrolls" data-id="396731" data-event="non farm payrolls">
  <td class=' 2026-09-04'><span>08:30 AM</span></td>
  <td><table><tr><td>US</td></tr></table></td>
  <td><a class="calendar-event">Non Farm Payrolls</a> <span class="calendar-reference">AUG</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>-23K</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'>12.0K</a></td>
</tr>
<tr data-url="/euro-area/core-inflation-rate" data-id="403647" data-event="core inflation rate yoy flash">
  <td class=' 2026-09-01'><span>05:00 AM</span></td>
  <td><table><tr><td>EA</td></tr></table></td>
  <td><a class="calendar-event">Flash</a> <span class="calendar-reference">AUG</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>2.5%</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'>2.6%</a></td>
</tr>
<tr data-url="/euro-area/core-inflation-rate" data-id="400496" data-event="core inflation rate yoy final">
  <td class=' 2026-09-17'><span>05:00 AM</span></td>
  <td><table><tr><td>EA</td></tr></table></td>
  <td><a class="calendar-event">Final</a> <span class="calendar-reference">AUG</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>2.5%</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'></a></td>
</tr>
<tr data-url="/united-states/non-manufacturing-pmi" data-id="396719" data-event="ism services pmi">
  <td class=' 2026-09-03'><span>02:00 PM</span></td>
  <td><table><tr><td>US</td></tr></table></td>
  <td><a class="calendar-event">ISM Services PMI</a> <span class="calendar-reference">AUG</span></td>
  <td><span id='actual'></span></td>
  <td><span id='previous'>54.1</span></td>
  <td><a id='consensus'></a></td>
  <td><a id='forecast'>53.8</a></td>
</tr>
`;

const INDICATOR_HTML = `
<table id="calendar">
<thead><tr><th>Calendar</th><th>GMT</th><th colspan="2">Reference</th><th>Actual</th><th>Previous</th><th>Consensus</th><th>TEForecast</th></tr></thead>
<tr data-id="398737" class='an-estimate-row' data-country="United States" data-category="Core PCE Price Index Annual Change">
  <td>2026-06-25</td><td>12:30 PM</td>
  <td><div class='d-none'> Core PCE Price Index YoY </div></td>
  <td id="reference"> May</span></td>
  <td id="actual" class="datatable-item"> 3.4% </td>
  <td id="previous" class="datatable-item"> 3.3% </td>
  <td class="datatable-item"> 3.4% </td>
  <td class="datatable-item"> 3.3% </td>
</tr>
<tr data-id="398174" class='an-estimate-row' data-country="United States" data-category="Core PCE Price Index Annual Change">
  <td>2026-07-30</td><td>12:30 PM</td>
  <td><div class='d-none'> Core PCE Price Index YoY </div></td>
  <td id="reference"> Jun</span></td>
  <td id="actual" class="datatable-item"> 3.3% </td>
  <td id="previous" class="datatable-item"> 3.4% </td>
  <td class="datatable-item"> 3.3% </td>
  <td class="datatable-item"> 3.2% </td>
</tr>
<tr data-id="399083" class='an-estimate-row' data-country="United States" data-category="Core PCE Price Index Annual Change">
  <td>2026-08-26</td><td>12:30 PM</td>
  <td><div class='d-none'> Core PCE Price Index YoY </div></td>
  <td id="reference"> Jul</span></td>
  <td id="actual" class="datatable-item"> </td>
  <td id="previous" class="datatable-item"> 3.3% </td>
  <td class="datatable-item"> 3.3% </td>
  <td class="datatable-item"> 3.4% </td>
</tr>
</table>
`;

const CPI_INDICATOR_HTML = `
<tr data-id="397907" class='an-estimate-row' data-category="Core Inflation Rate">
  <td>2026-07-14</td><td>12:30 PM</td>
  <td><div class='d-none'> Core Inflation Rate YoY </div></td>
  <td id="reference"> Jun</td>
  <td id="actual"> 2.6% </td>
  <td id="previous"> 2.9% </td>
  <td class="datatable-item"> 2.8% </td>
  <td class="datatable-item"> 2.9% </td>
</tr>
<tr data-id="398548" class='an-estimate-row' data-category="Core Inflation Rate">
  <td>2026-08-12</td><td>12:30 PM</td>
  <td><div class='d-none'> Core Inflation Rate YoY </div></td>
  <td id="reference"> Jul</td>
  <td id="actual"> 2.5% </td>
  <td id="previous"> 2.6% </td>
  <td class="datatable-item"> 2.5% </td>
  <td class="datatable-item"> 2.4% </td>
</tr>
<tr data-id="398351" class='an-estimate-row' data-category="Core Inflation Rate">
  <td>2026-09-11</td><td>12:30 PM</td>
  <td><div class='d-none'> Core Inflation Rate YoY </div></td>
  <td id="reference"> Aug</td>
  <td id="actual"> </td>
  <td id="previous"> 2.5% </td>
  <td class="datatable-item"> </td>
  <td class="datatable-item"> </td>
</tr>
`;

const AFTER_PCE_RELEASE_HTML = `
<tr data-id="399083" class='an-estimate-row' data-category="Core PCE Price Index Annual Change">
  <td>2026-08-26</td><td>12:30 PM</td>
  <td><div class='d-none'> Core PCE Price Index YoY </div></td>
  <td id="reference"> Jul</td>
  <td id="actual"> 3.3% </td>
  <td id="previous"> 3.3% </td>
  <td class="datatable-item"> 3.3% </td>
  <td class="datatable-item"> 3.4% </td>
</tr>
<tr data-id="399200" class='an-estimate-row' data-category="Core PCE Price Index Annual Change">
  <td>2026-09-25</td><td>12:30 PM</td>
  <td><div class='d-none'> Core PCE Price Index YoY </div></td>
  <td id="reference"> Aug</td>
  <td id="actual"> </td>
  <td id="previous"> 3.3% </td>
  <td class="datatable-item"> 3.1% </td>
  <td class="datatable-item"> 3.0% </td>
</tr>
`;

const countryRows = parseTeCalendarHtml(COUNTRY_HTML);
assert(countryRows.length === 7, `parsed ${countryRows.length} country rows`);
assert(referenceMonthKey("JUL", "2026-08-26") === "2026-07", "JUL on Aug 26 is 2026-07");
assert(upcomingObservationMonth("2026-06-01") === "2026-07", "June latest → July upcoming");
assert(upcomingObservationMonth("2026-07-01") === "2026-08", "after July prints, upcoming is August");
assert(!isReleasedActual(""), "empty actual is unreleased");
assert(!isReleasedActual("—"), "emdash actual is unreleased");
assert(isReleasedActual("3.3%"), "printed actual is released");

const pce = pickUpcomingTeRow(countryRows, TE_SERIES["us-core-pce"], "2026-07");
assert(pce?.consensus === "3.3%", `PCE consensus ${pce?.consensus}`);
assert(pce?.teForecast === "3.4%", `PCE TEForecast ${pce?.teForecast}`);
assert(pce?.previous === "3.3%", "previous actual is not used as consensus");
assert(parseTeNumeric(pce!.consensus) === 3.3, "parse 3.3%");
assert(parseTeNumeric(pce!.teForecast) === 3.4, "forecast stays distinct");
assert(pickUpcomingTeRow(countryRows, TE_SERIES["us-core-pce"], "2026-08") === null, "July forecast is not used after July is released");

const cpi = pickUpcomingTeRow(countryRows, TE_SERIES["us-core-cpi"], "2026-08");
assert(cpi?.previous === "2.5%", "CPI previous actual present");
assert(!cpi?.consensus, "CPI consensus empty");
assert(parseTeNumeric(cpi?.consensus ?? "") === null, "empty consensus is not a number");

const nfp = pickUpcomingTeRow(countryRows, TE_SERIES["us-nfp"], "2026-08");
assert(nfp?.event === "non farm payrolls", `NFP event ${nfp?.event}`);
assert(nfp?.id === "396731", "skip annual revision");
assert(!nfp?.consensus, "NFP consensus empty");
assert(parseTeNumeric(nfp!.teForecast) === 12, "TE model forecast is distinct and unused");

const hicp = pickUpcomingTeRow(countryRows, TE_SERIES["ea-core-hicp"], "2026-08");
assert(hicp?.event.includes("flash"), `next unreleased is flash, got ${hicp?.event}`);
assert(!hicp?.consensus, "do not use flash TE forecast 2.6 as consensus");
assert(hicp?.teForecast === "2.6%", "TEForecast is present but unused");

const ismSvc = pickUpcomingTeRow(countryRows, TE_SERIES["ism-services-pmi"], "2026-08");
assert(ismSvc?.event === "ism services pmi", "ISM Services comes from country calendar");
assert(!ismSvc?.consensus, "ISM Services consensus empty");
assert(ismSvc?.teForecast === "53.8", "ISM Services TEForecast unused");

const indicatorRows = parseTeIndicatorCalendarHtml(
  INDICATOR_HTML,
  "/united-states/core-pce-price-index-annual-change",
);
assert(indicatorRows.length === 3, `indicator rows ${indicatorRows.length}`);
assert(indicatorRows[0]?.consensus === "3.4%", "historical May consensus is parsed from column 7");
assert(indicatorRows[0]?.teForecast === "3.3%", "historical TEForecast is a different column");
const upcomingFromIndicator = pickUpcomingTeRow(indicatorRows, TE_SERIES["us-core-pce"], "2026-07");
assert(upcomingFromIndicator?.id === "399083", "upcoming is July, not the first Consensus 3.4%");
assert(upcomingFromIndicator?.consensus === "3.3%", upcomingFromIndicator?.consensus ?? "");
assert(upcomingFromIndicator?.teForecast === "3.4%", "indicator page Consensus ≠ TEForecast");
assert(pickUpcomingTeRow(indicatorRows, TE_SERIES["us-core-pce"], "2026-05") === null, "released May is not upcoming");

const cpiIndicator = parseTeIndicatorCalendarHtml(CPI_INDICATOR_HTML, "/united-states/core-inflation-rate");
const cpiUpcoming = pickUpcomingTeRow(cpiIndicator, TE_SERIES["us-core-cpi"], "2026-08");
assert(cpiUpcoming?.id === "398351", "CPI upcoming is August");
assert(!cpiUpcoming?.consensus, "do not take July historical consensus 2.5% for the next release");
assert(cpiIndicator.some((row) => row.consensus === "2.8%"), "historical consensus exists on the page");
const cpiReleased = pickReleasedTeRow(cpiIndicator, TE_SERIES["us-core-cpi"], "2026-07");
assert(cpiReleased?.consensus === "2.5%", `CPI latest-release Consensus ${cpiReleased?.consensus}`);
assert(cpiReleased?.teForecast === "2.4%", "July TEForecast is distinct and unused");
assert(cpiReleased?.actual === "2.5%", "July actual is present on the released event");
const cpiDiag = diagnoseConsensusPick("us-core-cpi", "yoy_mom", "2026-07-01", cpiIndicator);
assert(cpiDiag.selectedField === "Consensus", "parser always selects Consensus");
assert(cpiDiag.parserResult === null, "empty upcoming consensus is not filled from history");
assert(cpiDiag.teForecast === "—", cpiDiag.teForecast);

const cpiSplit = await consensusFromCalendarRows("us-core-cpi", "yoy_mom", "2026-07-01", cpiIndicator);
assert(cpiSplit.forecastDisplay === "2.5%", `CPI Consensus column ${cpiSplit.forecastDisplay}`);
assert(cpiSplit.nextReleaseConsensusDisplay === null, "CPI next-release Consensus stays blank when TE cell is empty");
assert(cpiSplit.observationMonth === "2026-07", cpiSplit.observationMonth ?? "");
assert(pickReleasedTeRow(cpiIndicator, TE_SERIES["us-core-cpi"], "2026-08") === null, "August is not used as latest-release consensus until it prints");

const merged = mergeTeCalendarRows([
  {
    id: "399083",
    url: "/united-states/core-pce-price-index-annual-change",
    event: "core pce price index yoy",
    category: "core pce",
    reference: "Jul",
    releaseDateIso: "2026-08-26",
    actual: "",
    previous: "3.3%",
    consensus: "",
    teForecast: "3.4%",
  },
  upcomingFromIndicator!,
]);
assert(merged.length === 1, "same event id merges");
assert(merged[0]?.consensus === "3.3%", "non-empty indicator Consensus wins over empty country cell");

const pceSplit = await consensusFromCalendarRows("us-core-pce", "yoy_mom", "2026-06-01", indicatorRows);
assert(pceSplit.forecastDisplay === "3.3%", `PCE Consensus column (June released) ${pceSplit.forecastDisplay}`);
assert(pceSplit.nextReleaseConsensusDisplay === "3.3%", `PCE next-release Consensus (July) ${pceSplit.nextReleaseConsensusDisplay}`);
assert(pceSplit.observationMonth === "2026-06", pceSplit.observationMonth ?? "");
assert(pceSplit.revisionDisplay === null, "latest-release path does not invent a revision");

const before = await consensusFromCalendarRows("us-core-pce", "yoy_mom", "2026-06-01", countryRows, new Date("2026-08-20T12:00:00Z"));
assert(before.forecastDisplay === null, "PCE column stays empty without the June released TE event");
assert(before.nextReleaseConsensusDisplay === "3.3%", before.nextReleaseConsensusDisplay ?? "");
assert(before.observationMonth === "2026-06", before.observationMonth ?? "");
assert(before.revisionDisplay === null, "single snapshot has no revision");

const pceDiag = diagnoseConsensusPick("us-core-pce", "yoy_mom", "2026-06-01", countryRows);
assert(pceDiag.consensus === "3.3%", pceDiag.consensus);
assert(pceDiag.teForecast === "3.4%", pceDiag.teForecast);
assert(pceDiag.parserResult === "3.3%", pceDiag.parserResult ?? "");
assert(pceDiag.selectedField === "Consensus", "must not select Forecast");

const points = appendForecastPoint(
  [
    { at: "2026-08-20T00:00:00.000Z", observationMonth: "2026-07", forecast: 3.4 },
    { at: "2026-08-25T00:00:00.000Z", observationMonth: "2026-07", forecast: 3.3 },
  ],
  { at: "2026-08-25T12:00:00.000Z", observationMonth: "2026-07", forecast: 3.3 },
);
assert(previousDistinctForecast(points) === 3.4, "previous forecast is same-month 3.4, not June actual");
const rev = formatConsensusRevision(3.3, 3.4, "yoy_mom");
assert(rev.value === "↓ 0.1 pp", rev.value);

const afterReleaseRows = parseTeIndicatorCalendarHtml(
  AFTER_PCE_RELEASE_HTML,
  "/united-states/core-pce-price-index-annual-change",
);
const afterRelease = await consensusFromCalendarRows(
  "us-core-pce",
  "yoy_mom",
  "2026-07-01",
  afterReleaseRows,
  new Date("2026-08-26T16:00:00Z"),
);
assert(afterRelease.observationMonth === "2026-07", afterRelease.observationMonth ?? "");
assert(afterRelease.forecastDisplay === "3.3%", `July released Consensus ${afterRelease.forecastDisplay}`);
assert(afterRelease.nextReleaseConsensusDisplay === "3.1%", `August upcoming Consensus ${afterRelease.nextReleaseConsensusDisplay}`);
assert(
  pickUpcomingTeRow(afterReleaseRows, TE_SERIES["us-core-pce"], "2026-07") === null,
  "July consensus is not active after July actual is released",
);

const missing = await consensusFromCalendarRows("us-core-cpi", "yoy_mom", "2026-07-01", countryRows);
assert(missing.forecastDisplay === null, "CPI column stays empty if the July TE event is not in the calendar scrape");
assert(missing.nextReleaseConsensusDisplay === null, "do not invent CPI next-release consensus");
assert(missing.forecast === null, "do not invent CPI from previous 2.5% or TEForecast");

resetForecastHistoryMemory();
const noRows = await consensusFromCalendarRows("us-core-pce", "yoy_mom", "2026-06-01", []);
assert(noRows.forecastDisplay === null, "empty calendar with no history does not invent a forecast");

const hicpDiag = diagnoseConsensusPick("ea-core-hicp", "yoy_mom", "2026-07-01", countryRows);
assert(hicpDiag.parserResult === null, "HICP flash TEForecast 2.6 is not selected");
assert(hicpDiag.teForecast === "2.6%", hicpDiag.teForecast);
assert(hicpDiag.reason.includes("Consensus cell is empty"), hicpDiag.reason);

const nfpDiag = diagnoseConsensusPick("us-nfp", "change_thousands", "2026-07-01", countryRows);
assert(nfpDiag.event === "non farm payrolls", nfpDiag.event);
assert(nfpDiag.parserResult === null, "NFP TEForecast 12.0K is not selected");
assert(nfpDiag.teForecast === "12.0K", nfpDiag.teForecast);

const augNow = new Date("2026-08-25T12:00:00Z");
const filtered = filterReleasedFredObservations(
  [
    { date: "2026-07-01", value: 100 },
    { date: "2026-08-01", value: 101 },
    { date: "2026-09-01", value: 102 },
  ],
  augNow,
);
assert(
  filtered.every((o) => o.date.startsWith("2026-07")),
  "current incomplete month and future months cannot be Latest",
);

assert(preferNewerObservationDate("2026-07-01", "2026-06-01") === "primary", "newer live wins");
assert(preferNewerObservationDate("2026-06-01", "2026-07-01") === "fallback", "older live does not replace newer cache");

assert(
  !shouldReuseCachedSnapshot({
    cachedAt: new Date("2026-08-26T08:00:00Z").getTime(),
    now: new Date("2026-08-26T12:00:00Z"),
    ttlMs: 6 * 60 * 60 * 1000,
    indicatorId: "us-core-pce",
    observationDate: "2026-06-01",
    nextReleaseDate: "2026-08-26",
  }),
  "release-day cache is not reused",
);

assert(
  !shouldReuseTeCalendarCache(
    {
      day: "2026-08-26",
      at: new Date("2026-08-26T08:00:00Z").getTime(),
      rows: [pce!],
    },
    new Date("2026-08-26T08:10:00Z"),
  ),
  "TE cache busts within 5 minutes when the upcoming event is due today",
);

assert(
  shouldReuseTeCalendarCache(
    {
      day: "2026-08-25",
      at: new Date("2026-08-25T12:00:00Z").getTime(),
      rows: [cpi!],
    },
    new Date("2026-08-25T12:10:00Z"),
  ),
  "TE cache can reuse same-day rows when the event is not due yet",
);

assert(
  !shouldReuseTeCalendarCache(
    {
      day: "2026-08-25",
      at: new Date("2026-08-25T12:00:00Z").getTime(),
      rows: [cpi!],
    },
    new Date("2026-08-26T12:00:00Z"),
  ),
  "TE cache does not carry into the next calendar day",
);

assert(MACRO_CONSENSUS_IDS.length === 9, "all 9 indicators have a TE consensus mapping");
assert(
  !Object.values(TE_SERIES).some((s) => s.calendarPath === "/united-states/manufacturing-pmi"),
  "do not use S&P Global manufacturing PMI",
);
assert(
  TE_SOURCE_URL["ism-manufacturing-pmi"] === "https://tradingeconomics.com/united-states/business-confidence",
  "ISM Manufacturing uses business-confidence",
);
assert(
  TE_SOURCE_URL["se-kpif"] === "https://tradingeconomics.com/sweden/cpi-with-fixed-interest-rate-yoy",
  "Sweden KPIF uses CPIF page, not generic CPI",
);

const teSrc = readFileSync(new URL("../src/lib/macroPulse/teCalendar.ts", import.meta.url), "utf8");
assert(!teSrc.includes("child_process") && !teSrc.includes("curl.exe"), "TE consensus uses fetch, not curl/child_process");
assert(!teSrc.includes("puppeteer") && !teSrc.includes("playwright"), "no browser automation");
assert(TE_CALENDAR_PAGES.includes("https://tradingeconomics.com/calendar"), "scrapes the public TE economic calendar");
assert(teSrc.includes('kind: "indicator"'), "indicator pages supply latest-release Consensus");

console.log("Macro Pulse consensus tests passed");
