import { createSwrCache } from "@/lib/commodities/swrCache";
import { readAnyCache, readFreshCache, writeCache } from "./cache";
import { fetchPolicyRate } from "./fetchers";
import { getSeedRow } from "./seed";
import {
  POLICY_RATES_CACHE_MS,
  isNextDecisionPassed,
  type PolicyBankId,
  type PolicyRateRow,
  type PolicyRatesPayload,
} from "./types";

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

const POLICY_DISK_PATH = "data/cache/policy-rates-payload.json";
/** Bumped after unverified-Fed snapshots were sticky for a full SWR TTL. */
const POLICY_CACHE_VERSION = 2;

export type PolicyRatesSwrPayload = PolicyRatesPayload & {
  fromStaleCache?: boolean;
};

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

async function loadPolicyRatesLive(): Promise<PolicyRatesSwrPayload> {
  const loaded = await Promise.all(BANK_ORDER.map((id) => loadBank(id)));
  const byId = new Map(loaded.map((row) => [row.id, row]));
  return {
    rows: BANK_ORDER.map((id) => byId.get(id)!),
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}

function usablePolicy(payload: PolicyRatesSwrPayload | null | undefined): payload is PolicyRatesSwrPayload {
  return Boolean(payload?.rows?.length === BANK_ORDER.length && typeof payload.fetchedAt === "string");
}

/** Do not treat a snapshot as cache-worthy if any live-source bank is still unverified. */
function policyCacheWorthy(payload: PolicyRatesSwrPayload | null | undefined): payload is PolicyRatesSwrPayload {
  if (!usablePolicy(payload)) return false;
  const blocked = payload.rows.some(
    (r) => r.hasLiveSource && (r.freshness === "unverified" || r.needsVerification),
  );
  return !blocked;
}

const policySwr = createSwrCache<PolicyRatesSwrPayload>({
  cacheMs: POLICY_RATES_CACHE_MS,
  version: POLICY_CACHE_VERSION,
  diskPath: POLICY_DISK_PATH,
  usable: usablePolicy,
  cacheWorthy: policyCacheWorthy,
  shouldPersist: policyCacheWorthy,
  loadLive: loadPolicyRatesLive,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

export function getCachedPolicyRates(): Promise<PolicyRatesSwrPayload> {
  return policySwr.load();
}

export function loadPolicyRatesForAudit(): Promise<PolicyRatesSwrPayload> {
  return policySwr.load();
}

export function clearPolicyRatesSwrMemoryForAudit(): void {
  policySwr.clearMemory();
}
