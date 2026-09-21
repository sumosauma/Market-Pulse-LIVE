/**
 * Sweden yield-curve tenor wiring: SWEA bills + Millistream bonds.
 * Run: npm run test:sweden-yield-tenors
 */
import {
  STRUCTURALLY_MISSING_SE,
  SWEDEN_DI_SERIES,
  SWEDEN_SWEA_BILL_SERIES,
  buildSwedenDiYieldSnapshot,
  snapshotToRowViews,
} from "../src/lib/yieldCurves/fetchSwedenDiCurve.ts";
import { resolveMaturitySourceType } from "../src/lib/yieldCurves/observations.ts";
import { getMaturityCoverage, getMaturityOfficialSource } from "../src/lib/yieldCurves/sovereignCountries.ts";
import type { ParsedSwedenRiksbankHistory } from "../src/lib/yieldCurves/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

{
  assert(STRUCTURALLY_MISSING_SE.length === 1 && STRUCTURALLY_MISSING_SE[0] === "1Y", "1Y is the only structurally missing SE tenor");
  assert(
    SWEDEN_DI_SERIES.map((s) => s.maturity).join(",") === "10Y,2Y,5Y,30Y",
    "DI series must be 10Y/2Y/5Y/30Y only",
  );
  assert(
    !SWEDEN_DI_SERIES.some((s) => s.insref === "33377"),
    "DI 3M insref 33377 must not be used",
  );
  assert(SWEDEN_SWEA_BILL_SERIES.find((s) => s.maturity === "1M")?.seriesId === "SETB1MBENCHC", "1M SWEA id");
  assert(SWEDEN_SWEA_BILL_SERIES.find((s) => s.maturity === "3M")?.seriesId === "SETB3MBENCH", "3M SWEA id");
  assert(SWEDEN_SWEA_BILL_SERIES.find((s) => s.maturity === "6M")?.seriesId === "SETB6MBENCH", "6M SWEA id");
}

{
  assert(getMaturityCoverage("SE", "1M") === "official", "1M coverage");
  assert(getMaturityCoverage("SE", "3M") === "official", "3M coverage");
  assert(getMaturityCoverage("SE", "6M") === "official", "6M coverage");
  assert(getMaturityCoverage("SE", "1Y") === "missing", "1Y coverage");
  assert(getMaturityOfficialSource("SE", "1M") === "Riksbank", "1M source");
  assert(getMaturityOfficialSource("SE", "3M") === "Riksbank", "3M source");
  assert(getMaturityOfficialSource("SE", "6M") === "Riksbank", "6M source");
  assert(getMaturityOfficialSource("SE", "2Y") === "Millistream/DI", "2Y source");
  assert(getMaturityOfficialSource("SE", "10Y") === "Millistream/DI", "10Y source");
  assert(getMaturityOfficialSource("SE", "30Y") === "Millistream/DI", "30Y source");
}

{
  assert(resolveMaturitySourceType("SE", "1M", 1.9, "Millistream/DI") === "official", "SWEA bills are official");
  assert(resolveMaturitySourceType("SE", "3M", 1.95, "Millistream/DI") === "official", "3M official");
  assert(resolveMaturitySourceType("SE", "2Y", 1.92, "Millistream/DI") === "external", "DI 2Y stays external");
  assert(resolveMaturitySourceType("SE", "1Y", null, "Millistream/DI") === "missing", "1Y missing");
}

{
  const history: ParsedSwedenRiksbankHistory = {
    fetchedAt: "2026-08-31T20:00:00.000Z",
    series: [
      {
        maturity: "10Y",
        seriesId: "33383",
        rows: [
          { date: "2026-08-27", value: 2.94 },
          { date: "2026-08-28", value: 2.95 },
          { date: "2026-08-31", value: 2.996 },
        ],
      },
      {
        maturity: "2Y",
        seriesId: "33381",
        rows: [
          { date: "2026-08-28", value: 1.91 },
          { date: "2026-08-31", value: 1.918 },
        ],
      },
      {
        maturity: "5Y",
        seriesId: "33382",
        rows: [
          { date: "2026-08-28", value: 2.58 },
          { date: "2026-08-31", value: 2.638 },
        ],
      },
      {
        maturity: "30Y",
        seriesId: "33399",
        rows: [
          { date: "2026-08-28", value: 3.19 },
          { date: "2026-08-31", value: 3.241 },
        ],
      },
      {
        maturity: "1M",
        seriesId: "SETB1MBENCHC",
        rows: [
          { date: "2026-08-27", value: 1.89 },
          { date: "2026-08-28", value: 1.897 },
        ],
      },
      {
        maturity: "3M",
        seriesId: "SETB3MBENCH",
        rows: [
          { date: "2026-08-27", value: 1.95 },
          { date: "2026-08-28", value: 1.956 },
        ],
      },
      {
        maturity: "6M",
        seriesId: "SETB6MBENCH",
        rows: [
          { date: "2026-08-27", value: 2.15 },
          { date: "2026-08-28", value: 2.16 },
        ],
      },
    ],
  };

  const snap = buildSwedenDiYieldSnapshot(history, "Today", "2026-08-31T20:00:00.000Z");
  assert(snap != null, "snapshot builds");
  const byMat = Object.fromEntries(snap!.points.map((p) => [p.maturity, p]));
  assert(byMat["1Y"]?.currentYield === null, "1Y is —");
  assert(byMat["1M"]?.currentYield === 1.897, "1M from SWEA");
  assert(byMat["3M"]?.currentYield === 1.956, "3M from SWEA");
  assert(byMat["6M"]?.currentYield === 2.16, "6M from SWEA");
  assert(byMat["2Y"]?.currentYield === 1.918, "2Y from DI");
  assert(byMat["5Y"]?.currentYield === 2.638, "5Y from DI");
  assert(byMat["10Y"]?.currentYield === 2.996, "10Y from DI");
  assert(byMat["30Y"]?.currentYield === 3.241, "30Y from DI");
  assert(snap!.source === "Millistream/DI", "snapshot envelope stays Millistream/DI");

  const rows = snapshotToRowViews(snap!);
  const row = (m: string) => rows.find((r) => r.maturity === m)!;
  assert(row("1M").current.source === "Riksbank" && row("1M").current.sourceType === "official", "1M row");
  assert(row("3M").current.source === "Riksbank" && row("3M").current.sourceType === "official", "3M row");
  assert(row("6M").current.source === "Riksbank" && row("6M").current.sourceType === "official", "6M row");
  assert(row("2Y").current.source === "Millistream/DI" && row("2Y").current.sourceType === "external", "2Y row");
  assert(row("10Y").current.source === "Millistream/DI", "10Y row source");
  assert(row("30Y").current.source === "Millistream/DI", "30Y row source");
  assert(row("1Y").current.sourceType === "missing" && row("1Y").currentYield === null, "1Y row missing");
}

console.log("test-sweden-yield-tenors: ok");
