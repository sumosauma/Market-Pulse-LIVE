import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIsmReportHtml } from "../src/lib/macroPulse/ismPmi.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures", "ism");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const servicesHtml = loadFixture("services-may-2026.html");
const services = parseIsmReportHtml(
  "services",
  servicesHtml,
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/may/",
);
assert(services !== null, "services parse failed");
assert(services.latest === 54.5, `services latest expected 54.5 got ${services?.latest}`);
assert(services.previous === 53.6, `services previous expected 53.6 got ${services?.previous}`);
assert(services.observationDate === "2026-05-01", `services month ${services?.observationDate}`);
assert(services.nextReleaseDisplay === "Jul 6, 2026", `services next ${services?.nextReleaseDisplay}`);
assert(services.nextReleaseIsEstimated === false, "services next should be official");

const mfgHtml = loadFixture("manufacturing-may-2026.html");
const mfg = parseIsmReportHtml(
  "manufacturing",
  mfgHtml,
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/may/",
);
assert(mfg !== null, "manufacturing parse failed");
assert(mfg.latest === 54, `manufacturing latest expected 54 got ${mfg?.latest}`);
assert(mfg.previous === 52.7, `manufacturing previous expected 52.7 got ${mfg?.previous}`);
assert(mfg.observationDate === "2026-05-01", `manufacturing month ${mfg?.observationDate}`);
assert(mfg.nextReleaseDisplay === "Jul 1, 2026", `manufacturing next ${mfg?.nextReleaseDisplay}`);

const servicesJulyHtml = loadFixture("services-july-2026.html");
const servicesJuly = parseIsmReportHtml(
  "services",
  servicesJulyHtml,
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/july/",
);
assert(servicesJuly !== null, "services July parse failed");
assert(servicesJuly.latest === 54.1, `services July latest expected 54.1 got ${servicesJuly?.latest}`);
assert(servicesJuly.previous === 54, `services July previous expected 54 got ${servicesJuly?.previous}`);
assert(servicesJuly.observationDate === "2026-07-01", `services July month ${servicesJuly?.observationDate}`);
assert(servicesJuly.nextReleaseDisplay === "Sep 3, 2026", `services July next ${servicesJuly?.nextReleaseDisplay}`);
assert(servicesJuly.nextReleaseIsEstimated === false, "services July next should be official");

const mfgJulyHtml = loadFixture("manufacturing-july-2026.html");
const mfgJuly = parseIsmReportHtml(
  "manufacturing",
  mfgJulyHtml,
  "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/july/",
);
assert(mfgJuly !== null, "manufacturing July parse failed");
assert(mfgJuly.latest === 55.6, `manufacturing July latest expected 55.6 got ${mfgJuly?.latest}`);
assert(mfgJuly.previous === 53.3, `manufacturing July previous expected 53.3 got ${mfgJuly?.previous}`);
assert(mfgJuly.observationDate === "2026-07-01", `manufacturing July month ${mfgJuly?.observationDate}`);
assert(mfgJuly.nextReleaseDisplay === "Sep 1, 2026", `manufacturing July next ${mfgJuly?.nextReleaseDisplay}`);
assert(mfgJuly.nextReleaseIsEstimated === false, "manufacturing July next should be official");
assert(
  Number((mfgJuly.latest - mfgJuly.previous).toFixed(1)) === 2.3,
  `manufacturing July change expected +2.3 got ${mfgJuly.latest - mfgJuly.previous}`,
);

console.log("ISM parser fixtures OK", {
  services: { latest: services.latest, previous: services.previous, change: services.latest - services.previous },
  manufacturing: { latest: mfg.latest, previous: mfg.previous, change: mfg.latest - mfg.previous },
  servicesJuly: {
    latest: servicesJuly.latest,
    previous: servicesJuly.previous,
    change: Number((servicesJuly.latest - servicesJuly.previous).toFixed(1)),
    next: servicesJuly.nextReleaseDisplay,
  },
  manufacturingJuly: {
    latest: mfgJuly.latest,
    previous: mfgJuly.previous,
    change: Number((mfgJuly.latest - mfgJuly.previous).toFixed(1)),
    next: mfgJuly.nextReleaseDisplay,
  },
});
