import { expectedObservationMonth, isObservationStale } from "../src/lib/macroPulse/freshness.ts";
import { getPolicyRateRows } from "../src/lib/policyRates/policyRates.ts";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const now = new Date();
console.log("=== DIAGNOSIS", now.toISOString(), "===\n");

function monthKey(d) {
  return d.slice(0, 7);
}

async function fetchFredLatest(seriesId) {
  const key = process.env.FRED_API_KEY;
  if (!key) return { ok: false, error: "FRED_API_KEY missing" };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=3`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = await res.json();
  const obs = (json.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  if (!obs.length) return { ok: false, error: "empty" };
  return { ok: true, latest: obs[0], prior: obs[1] ?? null };
}

const fredSeries = [
  { id: "us-core-cpi", series: "CPILFESL", label: "US Core CPI" },
  { id: "us-core-pce", series: "PCEPILFE", label: "US Core PCE" },
  { id: "ea-core-hicp", series: "TOTNRGFOODEA20MI15XM", label: "EA Core HICP" },
  { id: "us-nfp", series: "PAYEMS", label: "US NFP" },
  { id: "us-unemployment", series: "UNRATE", label: "US Unemployment" },
];

console.log("--- MACRO PULSE (live FRED) ---");
console.log("FRED_API_KEY:", process.env.FRED_API_KEY ? "set" : "MISSING");

for (const row of fredSeries) {
  const expected = expectedObservationMonth(row.id, now);
  const live = await fetchFredLatest(row.series);
  if (!live.ok) {
    console.log(`${row.label}: OFFLINE/ERROR — ${live.error} | expected month ${expected}`);
    continue;
  }
  const obsYm = monthKey(live.latest.date);
  const stale = isObservationStale(row.id, live.latest.date, now);
  console.log(
    `${row.label}: live=${live.latest.value} @ ${live.latest.date} (${obsYm}) | expected=${expected} | staleFlag=${stale} | ${stale ? "BEHIND" : "CURRENT"}`,
  );
}

console.log("\n--- MACRO PULSE (SCB) ---");
try {
  const { fetchScbKpif } = await import("../src/lib/macroPulse/scbPxWeb.ts");
  const kpif = await fetchScbKpif();
  const iso = `${kpif.observationMonth.slice(0, 4)}-${kpif.observationMonth.slice(5, 7)}-01`;
  const expected = expectedObservationMonth("se-kpif", now);
  const stale = isObservationStale("se-kpif", iso, now);
  console.log(
    `Sweden KPIF: yoy=${kpif.yoy} mom=${kpif.mom} month=${kpif.observationMonth} iso=${iso} | expected=${expected} | stale=${stale}`,
  );
} catch (e) {
  console.log("Sweden KPIF: ERROR", e instanceof Error ? e.message : e);
}

try {
  const { fetchScbUnemployment } = await import("../src/lib/macroPulse/scbPxWeb.ts");
  const unemp = await fetchScbUnemployment();
  const iso = `${unemp.observationMonth.slice(0, 4)}-${unemp.observationMonth.slice(5, 7)}-01`;
  const expected = expectedObservationMonth("se-unemployment", now);
  const stale = isObservationStale("se-unemployment", iso, now);
  console.log(
    `Sweden Unemp: level=${unemp.level} month=${unemp.observationMonth} | expected=${expected} | stale=${stale}`,
  );
} catch (e) {
  console.log("Sweden Unemp: ERROR", e instanceof Error ? e.message : e);
}

console.log("\n--- MACRO PULSE (ISM pages) ---");
for (const kind of ["manufacturing", "services"]) {
  const url =
    kind === "manufacturing"
      ? "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/"
      : "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/services/";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const html = await res.text();
    console.log(
      `ISM ${kind}: HTTP ${res.status} len=${html.length} blocked=${res.status === 403 || res.status === 401}`,
    );
  } catch (e) {
    console.log(`ISM ${kind}: ERROR`, e instanceof Error ? e.message : e);
  }
}

console.log("\n--- POLICY RATES (static hardcoded config) ---");
console.log("NOTE: Policy rates are NOT live-fetched — manually maintained in policyRates.ts");
const rows = getPolicyRateRows(now);
for (const r of rows) {
  const asOfAgeDays = Math.floor(
    (now.getTime() - new Date(r.asOf + "T00:00:00Z").getTime()) / 86400000,
  );
  const nextPast = r.nextDecisionIso
    ? new Date(r.nextDecisionIso + "T00:00:00Z").getTime() <
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    : false;
  const flags = [
    nextPast ? "NEXT_DATE_PASSED" : null,
    asOfAgeDays > 45 ? "ASOF_OLD" : null,
    r.needsVerification ? "NEEDS_VERIFY" : null,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(
    `${r.bankShort.padEnd(8)} rate=${String(r.rateDisplay).padEnd(12)} asOf=${r.asOf} (${asOfAgeDays}d) next=${r.nextDecisionDisplay.padEnd(22)} ${flags}`,
  );
}

console.log("\n--- DISK CACHE ---");
const cacheDir = "data/cache";
if (!existsSync(cacheDir)) {
  console.log("data/cache missing");
} else {
  const entries = readdirSync(cacheDir);
  if (!entries.length) console.log("data/cache is EMPTY (no macro-pulse.json)");
  else {
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else console.log(`${p} ${st.size}b mtime=${st.mtime.toISOString()}`);
      }
    };
    walk(cacheDir);
  }
}

console.log("\n--- CACHING NOTES ---");
console.log("Macro Pulse: 6h in-memory server cache + client staleTime 6h (queryKey v9).");
console.log("Policy Rates: fully static — never auto-updates from the web.");
