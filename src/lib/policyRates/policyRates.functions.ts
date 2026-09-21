import { createServerFn } from "@tanstack/react-start";
import { readAnyCache, readFreshCache, writeCache } from "./cache";
import { fetchPolicyRate } from "./fetchers";
import { getSeedRow } from "./seed";
import {
  isNextDecisionPassed,
  type PolicyBankId,
  type PolicyRateRow,
  type PolicyRatesPayload,
} from "./types";

export const POLICY_RATES_QUERY_KEY = ["policy-rates", "v3"] as const;

const BANK_ORDER: PolicyBankId[] = [
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

function markUnverified(row: PolicyRateRow, since: string): PolicyRateRow {
  const passed = isNextDecisionPassed(row.nextDecisionIso);
  return {
    ...row,
    freshness: "unverified",
    unverifiedSince: since,
    needsVerification: true,
    ...(passed
      ? {
          nextDecisionIso: null,
          nextDecisionDisplay: "—",
          nextDateSource: "none" as const,
        }
      : {}),
  };
}

async function loadBank(id: PolicyBankId): Promise<PolicyRateRow> {
  const fresh = readFreshCache(id);
  if (fresh) {
    console.log(`[POLICY][${id}] cache hit freshness=${fresh.freshness}`);
    return fresh;
  }

  try {
    const live = await fetchPolicyRate(id);
    writeCache(live);
    console.log(
      `[POLICY][${id}] ${live.hasLiveSource ? "live" : "no-live-source"} ok rate=${live.rateDisplay} asOf=${live.asOf} next=${live.nextDecisionIso ?? "—"} freshness=${live.freshness}`,
    );
    return live;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[POLICY][${id}] fetch-failed ${msg}`);

    const cached = readAnyCache(id);
    const fallback = markUnverified(cached ?? getSeedRow(id), (cached ?? getSeedRow(id)).asOf);
    writeCache(fallback);
    return fallback;
  }
}

async function loadPolicyRates(): Promise<PolicyRatesPayload> {
  const loaded = await Promise.all(BANK_ORDER.map((id) => loadBank(id)));
  const byId = new Map(loaded.map((row) => [row.id, row]));
  return {
    rows: BANK_ORDER.map((id) => byId.get(id)!),
    fetchedAt: new Date().toISOString(),
  };
}

export const getPolicyRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<PolicyRatesPayload> => loadPolicyRates(),
);
