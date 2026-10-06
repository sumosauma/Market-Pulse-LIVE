import type { ParsedGermanyBundesbankHistory, YieldMaturity } from "./types";

/**
 * Deutsche Bundesbank daily Svensson zero-coupon curve for listed German Federal securities.
 * Dataset BBSIS. Spots are ZST/ZI. Short end is evaluated from B0–B3 and T1–T2.
 * This is not the ECB euro-area AAA curve and not a par yield (ZAR).
 */
const BBK_BASE = "https://api.statistiken.bundesbank.de/rest/data/BBSIS";
const LOOKBACK_DAYS = 450;

const SPOT_BATCH =
  "D.I.ZST.ZI.EUR.S1311.B.A604.R01XX+R02XX+R05XX+R10XX+R30XX.R.A.A._Z._Z.A";
const PARAM_BATCH = "D.I.ZST.B0+B1+B2+B3+T1+T2.EUR.S1311.B.A604._Z.R.A.A._Z._Z.A";

const SPOT_CODE: Record<string, YieldMaturity> = {
  R01XX: "1Y",
  R02XX: "2Y",
  R05XX: "5Y",
  R10XX: "10Y",
  R30XX: "30Y",
};

const PARAM_CODES = ["B0", "B1", "B2", "B3", "T1", "T2"] as const;
type ParamCode = (typeof PARAM_CODES)[number];

const SHORT_TENORS: readonly { maturity: YieldMaturity; years: number }[] = [
  { maturity: "1M", years: 1 / 12 },
  { maturity: "3M", years: 0.25 },
  { maturity: "6M", years: 0.5 },
];

const PUBLISHED: readonly YieldMaturity[] = ["1Y", "2Y", "5Y", "10Y", "30Y"];

export type SvenssonParams = Readonly<{
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  t1: number;
  t2: number;
}>;

/**
 * Bundesbank Svensson zero-coupon spot in percent.
 * y(t) = β0 + β1·a1 + β2·(a1 − e^(−t/τ1)) + β3·(a2 − e^(−t/τ2))
 * where a_i = (1 − e^(−t/τ_i)) / (t/τ_i) and t is maturity in years.
 */
export function bundesbankSvenssonSpot(tYears: number, p: SvenssonParams): number | null {
  if (!(tYears > 0) || !(p.t1 > 0) || !(p.t2 > 0)) return null;
  const x1 = tYears / p.t1;
  const x2 = tYears / p.t2;
  const a1 = (1 - Math.exp(-x1)) / x1;
  const a2 = (1 - Math.exp(-x2)) / x2;
  const y = p.b0 + p.b1 * a1 + p.b2 * (a1 - Math.exp(-x1)) + p.b3 * (a2 - Math.exp(-x2));
  if (!Number.isFinite(y) || y <= -2 || y > 25) return null;
  return Math.round(y * 10000) / 10000;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function spotKey(code: string): string {
  return `D.I.ZST.ZI.EUR.S1311.B.A604.${code}.R.A.A._Z._Z.A`;
}

function paramKey(code: string): string {
  return `D.I.ZST.${code}.EUR.S1311.B.A604._Z.R.A.A._Z._Z.A`;
}

async function fetchBbkCsv(key: string, start: string, end: string): Promise<string> {
  const url = `${BBK_BASE}/${encodeURIComponent(key)}?startPeriod=${start}&endPeriod=${end}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(25_000),
    headers: { Accept: "text/csv", "User-Agent": "MarketPulse/1.0" },
  });
  if (!res.ok) throw new Error(`Bundesbank ${res.status}`);
  const text = await res.text();
  if (!text.includes("TIME_PERIOD")) throw new Error("Bundesbank response was not a data CSV");
  return text;
}

type Observation = { code: string; date: string; value: number };

function parseBbkObservations(csv: string): Observation[] {
  const rows = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(";"));
  const headerIdx = rows.findIndex((r) => r.includes("TIME_PERIOD") && r.includes("OBS_VALUE"));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx]!;
  const timeIdx = header.indexOf("TIME_PERIOD");
  const valueIdx = header.indexOf("OBS_VALUE");
  const out: Observation[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const date = row[timeIdx]?.trim() ?? "";
    const raw = row[valueIdx]?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!raw || raw === "." || raw === "-") continue;
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const code = row.find((cell) => /^(R\d{2}XX|B0|B1|B2|B3|T1|T2)$/.test(cell.trim()))?.trim();
    if (!code) continue;
    out.push({ code, date, value });
  }
  return out;
}

async function fetchCodedObservations(
  batchKey: string,
  singleKeys: readonly string[],
  start: string,
  end: string,
): Promise<Observation[]> {
  try {
    const batch = parseBbkObservations(await fetchBbkCsv(batchKey, start, end));
    if (batch.length) return batch;
  } catch {
    // Dimension OR is not always accepted; fall through to one request per series.
  }
  const parts = await Promise.all(
    singleKeys.map(async (key) => {
      try {
        return parseBbkObservations(await fetchBbkCsv(key, start, end));
      } catch {
        return [];
      }
    }),
  );
  return parts.flat();
}

function rowsFromMap(map: Map<string, number>): { date: string; value: number }[] {
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

export async function fetchGermanyBundesbankHistory(): Promise<ParsedGermanyBundesbankHistory> {
  const end = new Date().toISOString().slice(0, 10);
  const start = isoDaysAgo(LOOKBACK_DAYS);
  const [spotObs, paramObs] = await Promise.all([
    fetchCodedObservations(SPOT_BATCH, Object.keys(SPOT_CODE).map(spotKey), start, end),
    fetchCodedObservations(PARAM_BATCH, PARAM_CODES.map(paramKey), start, end),
  ]);

  const published = new Map<YieldMaturity, Map<string, number>>();
  for (const maturity of PUBLISHED) published.set(maturity, new Map());
  for (const obs of spotObs) {
    const maturity = SPOT_CODE[obs.code];
    if (!maturity) continue;
    published.get(maturity)!.set(obs.date, obs.value);
  }

  const paramsByDate = new Map<string, Partial<Record<ParamCode, number>>>();
  for (const obs of paramObs) {
    if (!PARAM_CODES.includes(obs.code as ParamCode)) continue;
    const slot = paramsByDate.get(obs.date) ?? {};
    slot[obs.code as ParamCode] = obs.value;
    paramsByDate.set(obs.date, slot);
  }

  const short = new Map<YieldMaturity, Map<string, number>>();
  for (const { maturity } of SHORT_TENORS) short.set(maturity, new Map());
  for (const [date, slot] of paramsByDate) {
    if (slot.B0 == null || slot.B1 == null || slot.B2 == null || slot.B3 == null) continue;
    if (slot.T1 == null || slot.T2 == null) continue;
    const params: SvenssonParams = {
      b0: slot.B0,
      b1: slot.B1,
      b2: slot.B2,
      b3: slot.B3,
      t1: slot.T1,
      t2: slot.T2,
    };
    for (const { maturity, years } of SHORT_TENORS) {
      const y = bundesbankSvenssonSpot(years, params);
      if (y != null) short.get(maturity)!.set(date, y);
    }
  }

  const failedMaturities: YieldMaturity[] = [];
  const series: ParsedGermanyBundesbankHistory["series"][number][] = [];
  for (const maturity of ["1M", "3M", "6M", ...PUBLISHED] as YieldMaturity[]) {
    const map = short.get(maturity) ?? published.get(maturity);
    const rows = map ? rowsFromMap(map) : [];
    if (rows.length) series.push({ maturity, rows });
    else failedMaturities.push(maturity);
  }

  if (!series.some((s) => s.maturity === "10Y" && s.rows.length)) {
    throw new Error("Bundesbank published 10Y zero-coupon series was empty");
  }

  const tenYear = series.find((s) => s.maturity === "10Y")!.rows;
  return {
    fetchedAt: new Date().toISOString(),
    sourceEndpoint: "https://api.statistiken.bundesbank.de/rest/data/BBSIS",
    latestDate: tenYear[tenYear.length - 1]?.date ?? null,
    series,
    failedMaturities: failedMaturities.length ? failedMaturities : undefined,
  };
}
