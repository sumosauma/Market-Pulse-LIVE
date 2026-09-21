import {
  computeIndexYoYMoM,
  computePayemsChange,
  computeUnemploymentLevel,
  filterReleasedFredObservations,
} from "../src/lib/macroPulse/fredSeries.ts";
import { formatChangeReferenceMonth } from "../src/lib/macroPulse/format.ts";
import {
  preferNewerObservationDate,
  shouldReuseCachedSnapshot,
} from "../src/lib/macroPulse/freshness.ts";
import { pickFredNextReleaseDate } from "../src/lib/macroPulse/nextRelease.ts";
import { getLatestScbMonths } from "../src/lib/macroPulse/scbPxWeb.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function indexSeries(endYm: string, months: number, start = 100): { date: string; value: number }[] {
  const [y, m] = endYm.split("-").map(Number);
  const out: { date: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ date: `${ym}-01`, value: start + (months - 1 - i) });
  }
  return out;
}

const julyNow = new Date("2026-08-25T12:00:00Z");
const cpiJuly = computeIndexYoYMoM(indexSeries("2026-07", 14));
assert(cpiJuly.observationDate === "2026-07-01", `CPI latest period ${cpiJuly.observationDate}`);
assert(formatChangeReferenceMonth(cpiJuly.observationDate) === "Jun 2026", "CPI previous period label");
assert(cpiJuly.changeVsPriorDisplay != null, "CPI change is computed");

const cpiAugust = computeIndexYoYMoM(indexSeries("2026-08", 15));
assert(cpiAugust.observationDate === "2026-08-01", "August CPI becomes latest when present");
assert(formatChangeReferenceMonth(cpiAugust.observationDate) === "Jul 2026", "July becomes previous period");
assert(cpiAugust.headlineValue !== cpiJuly.headlineValue, "headline recomputes on new month");

const withFuture = filterReleasedFredObservations(
  [...indexSeries("2026-07", 14), { date: "2026-09-01", value: 200 }],
  julyNow,
);
assert(
  !withFuture.some((o) => o.date.startsWith("2026-09")),
  "future FRED months are dropped",
);
assert(computeIndexYoYMoM(withFuture).observationDate === "2026-07-01", "unreleased month is not used");

const currentMonthBlocked = filterReleasedFredObservations(
  [...indexSeries("2026-07", 14), { date: "2026-08-01", value: 200 }],
  julyNow,
);
assert(
  !currentMonthBlocked.some((o) => o.date.startsWith("2026-08")),
  "incomplete current month cannot enter Latest",
);

const pceJune = computeIndexYoYMoM(indexSeries("2026-06", 14));
assert(pceJune.observationDate === "2026-06-01", "PCE stays on latest available month (June)");

const nfpJuly = computePayemsChange([
  { date: "2026-05-01", value: 158861 },
  { date: "2026-06-01", value: 158881 },
  { date: "2026-07-01", value: 158858 },
]);
assert(nfpJuly.observationDate === "2026-07-01", "NFP latest is last month in series");
assert(nfpJuly.headlineValue === "-23k", `NFP print ${nfpJuly.headlineValue}`);
assert(nfpJuly.changeVsPriorDisplay === "-43k", `NFP change ${nfpJuly.changeVsPriorDisplay}`);

const nfpAugust = computePayemsChange([
  { date: "2026-05-01", value: 158861 },
  { date: "2026-06-01", value: 158881 },
  { date: "2026-07-01", value: 158858 },
  { date: "2026-08-01", value: 158900 },
]);
assert(nfpAugust.observationDate === "2026-08-01", "August NFP becomes latest");
assert(nfpAugust.headlineValue === "+42k", `August NFP print ${nfpAugust.headlineValue}`);
assert(formatChangeReferenceMonth(nfpAugust.observationDate) === "Jul 2026", "NFP previous period follows latest");

const unemp = computeUnemploymentLevel([
  { date: "2026-06-01", value: 4.2 },
  { date: "2026-07-01", value: 4.1 },
]);
assert(unemp.headlineValue === "4.1%", unemp.headlineValue);
assert(unemp.changeVsPriorDisplay === "-0.1 pp", unemp.changeVsPriorDisplay ?? "");

const unempFlat = computeUnemploymentLevel([
  { date: "2026-07-01", value: 4.1 },
  { date: "2026-08-01", value: 4.1 },
]);
assert(unempFlat.observationDate === "2026-08-01", "unemployment latest month advances");
assert(unempFlat.changeVsPriorDisplay === "0.0 pp", "change is latest minus previous level");

const pceDates = ["2026-08-26", "2026-09-30", "2026-10-29"];
assert(
  pickFredNextReleaseDate(pceDates, "2026-06-01", new Date("2026-08-25T12:00:00Z")) === "2026-08-26",
  "PCE next is Aug 26 while June is still latest",
);
assert(
  pickFredNextReleaseDate(pceDates, "2026-07-01", new Date("2026-08-26T16:00:00Z")) === "2026-09-30",
  "after July PCE is in, next skips today",
);

const cpiDates = ["2026-09-11", "2026-10-14"];
assert(
  pickFredNextReleaseDate(cpiDates, "2026-07-01", new Date("2026-08-25T12:00:00Z")) === "2026-09-11",
  "CPI next stays Sep 11 before the print",
);
assert(
  pickFredNextReleaseDate(cpiDates, "2026-08-01", new Date("2026-09-11T16:00:00Z")) === "2026-10-14",
  "after August CPI is in, next moves to October",
);

const scbMonths = getLatestScbMonths(["2026M05", "2026M06", "2026M07"], 3);
assert(scbMonths.at(-1) === "2026M07", "SCB latest is last metadata month");
const scbAfterAugust = getLatestScbMonths(["2026M05", "2026M06", "2026M07", "2026M08"], 3);
assert(scbAfterAugust.at(-1) === "2026M08", "SCB advances when metadata includes the new month");
assert(scbAfterAugust[1] === "2026M07", "previous SCB month is the one before latest");

assert(preferNewerObservationDate("2026-07-01", "2026-06-01") === "primary", "newer live wins over older cache");
assert(preferNewerObservationDate("2026-06-01", "2026-07-01") === "fallback", "older live does not replace newer cache");

const ttl = 6 * 60 * 60 * 1000;
const cachedAt = new Date("2026-08-25T08:00:00Z").getTime();
assert(
  shouldReuseCachedSnapshot({
    cachedAt,
    now: new Date("2026-08-25T10:00:00Z"),
    ttlMs: ttl,
    indicatorId: "ism-manufacturing-pmi",
    observationDate: "2026-07-01",
    nextReleaseDate: "2026-09-01",
  }),
  "ISM July cache is reusable before Sep 1",
);
assert(
  !shouldReuseCachedSnapshot({
    cachedAt,
    now: new Date("2026-09-01T14:00:00Z"),
    ttlMs: ttl,
    indicatorId: "ism-manufacturing-pmi",
    observationDate: "2026-07-01",
    nextReleaseDate: "2026-09-01",
  }),
  "ISM July cache is not reused on Sep 1 even inside TTL",
);
assert(
  !shouldReuseCachedSnapshot({
    cachedAt,
    now: new Date("2026-08-26T12:00:00Z"),
    ttlMs: ttl,
    indicatorId: "us-core-pce",
    observationDate: "2026-06-01",
    nextReleaseDate: "2026-08-26",
  }),
  "PCE cache is not reused on the BEA release day",
);

console.log("Macro Pulse progression checks OK");
