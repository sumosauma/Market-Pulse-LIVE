import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseScbCpiOrdinaryPublication,
  parseScbLfsNextPublishing,
} from "../src/lib/macroPulse/nextRelease.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures", "scb");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const cpiHtml = loadFixture("cpi-july-2026-news.html");
const cpiNext = parseScbCpiOrdinaryPublication(cpiHtml);
assert(cpiNext === "2026-09-14", `KPIF ordinary publication expected 2026-09-14 got ${cpiNext}`);
assert(!cpiHtml.includes("Ordinary publication") || cpiNext !== "2026-09-07", "must not use CPI flash estimate");

const lfsHtml = loadFixture("lfs-july-2026-news.html");
const lfsNext = parseScbLfsNextPublishing(lfsHtml);
assert(lfsNext === "2026-09-16", `LFS next publishing expected 2026-09-16 got ${lfsNext}`);

console.log("SCB next-release parsers OK", {
  kpifOrdinary: cpiNext,
  lfsNext,
});
