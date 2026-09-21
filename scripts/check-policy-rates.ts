import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { fetchPolicyRate } from "../src/lib/policyRates/fetchers.ts";
import { utcTodayIso, type PolicyBankId } from "../src/lib/policyRates/types.ts";

function loadEnvKeys(): void {
  if (!existsSync(".env")) return;
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(FRED_API_KEY|TCMB_API_KEY)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      const val = m[2]!.trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

const BANKS: PolicyBankId[] = [
  "fed",
  "ecb",
  "boe",
  "boj",
  "boc",
  "rba",
  "snb",
  "riksbank",
  "norges",
  "tcmb",
  "china-lpr",
];

loadEnvKeys();

if (existsSync("data/cache/policy-rates.json")) {
  unlinkSync("data/cache/policy-rates.json");
  console.log("deleted data/cache/policy-rates.json");
}

const today = utcTodayIso();
console.log(`today (UTC) = ${today}\n`);

const results = await Promise.all(
  BANKS.map(async (id) => {
    const started = Date.now();
    try {
      const row = await fetchPolicyRate(id);
      const next = row.nextDecisionIso;
      const days =
        next != null
          ? Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
          : null;
      return {
        id,
        ok: true,
        ms: Date.now() - started,
        rate: row.rateDisplay,
        asOf: row.asOf,
        next,
        days,
        freshness: row.freshness,
        hasLiveSource: row.hasLiveSource,
        liveSourceLabel: row.liveSourceLabel,
        unverifiedSince: row.unverifiedSince,
        last: row.latestChange?.display ?? null,
        lastDate: row.latestChange?.dateIso ?? null,
        lastKind: row.latestChange?.kind ?? null,
        nextDisplay: row.nextDecisionDisplay,
      };
    } catch (err) {
      return {
        id,
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),
);

console.log("bank        live  rate           asOf        next        last              lastDate    source");
console.log("----------  ----  -------------  ----------  ----------  ----------------  ----------  ------");
for (const r of results) {
  if (r.ok) {
    console.log(
      [
        r.id.padEnd(10),
        r.hasLiveSource && r.freshness === "live" ? "LIVE" : "NO  ",
        String(r.rate).padEnd(13),
        r.asOf,
        (r.next ?? "—").padEnd(10),
        String(r.last).padEnd(16),
        r.lastDate,
        r.liveSourceLabel,
      ].join("  "),
    );
  } else {
    console.log(`${r.id.padEnd(10)}  FAIL  ${r.error}`);
  }
}

const liveOk = results.filter((r) => r.ok && r.hasLiveSource && r.freshness === "live");
const noNext = results.filter((r) => r.ok && !r.next);
const fail = results.filter((r) => !r.ok);
const far = results.filter((r) => r.ok && r.days != null && (r.days <= 0 || r.days > 120));

console.log("\n--- summary ---");
console.log(`live fetch ok: ${liveOk.map((r) => r.id).join(", ") || "(none)"}`);
console.log(`no next-meeting date: ${noNext.map((r) => r.id).join(", ") || "(none)"}`);
console.log(`implausible next (>120d or past): ${far.map((r) => r.id).join(", ") || "(none)"}`);
console.log(`failed: ${fail.map((r) => r.id).join(", ") || "(none)"}`);
if (!process.env.TCMB_API_KEY) {
  console.log("TCMB_API_KEY not set — TCMB rate comes from the official 1 Week Repo HTML table.");
}
