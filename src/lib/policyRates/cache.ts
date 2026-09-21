import {
  POLICY_RATES_CACHE_MS,
  isImplausibleNextDecision,
  isNextDecisionPassed,
  type PolicyBankId,
  type PolicyRateRow,
} from "./types";

const DISK_CACHE_PATH = "data/cache/policy-rates.json";

type DiskCacheFile = {
  savedAt: string;
  entries: Partial<Record<PolicyBankId, { savedAt: string; row: PolicyRateRow }>>;
};

const memory = new Map<PolicyBankId, { at: number; row: PolicyRateRow }>();

function readDisk(): DiskCacheFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    if (!existsSync(DISK_CACHE_PATH)) return { savedAt: new Date().toISOString(), entries: {} };
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (!raw?.entries) return { savedAt: new Date().toISOString(), entries: {} };
    return raw;
  } catch {
    return { savedAt: new Date().toISOString(), entries: {} };
  }
}

function writeDisk(file: DiskCacheFile): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname } = require("path") as typeof import("path");
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file, null, 2), "utf8");
  } catch {
    /* read-only filesystem */
  }
}

export function isFreshCache(row: PolicyRateRow, savedAtIso: string, now = new Date()): boolean {
  const age = now.getTime() - new Date(savedAtIso).getTime();
  if (age > POLICY_RATES_CACHE_MS) return false;
  if (isNextDecisionPassed(row.nextDecisionIso, now)) return false;
  if (isImplausibleNextDecision(row.nextDecisionIso, now)) return false;
  return true;
}

export function readFreshCache(id: PolicyBankId, now = new Date()): PolicyRateRow | null {
  const mem = memory.get(id);
  if (mem && isFreshCache(mem.row, new Date(mem.at).toISOString(), now)) {
    return { ...mem.row, freshness: mem.row.freshness === "live" ? "cached" : mem.row.freshness };
  }
  const disk = readDisk().entries[id];
  if (disk && isFreshCache(disk.row, disk.savedAt, now)) {
    memory.set(id, { at: new Date(disk.savedAt).getTime(), row: disk.row });
    return { ...disk.row, freshness: disk.row.freshness === "live" ? "cached" : disk.row.freshness };
  }
  return null;
}

export function readAnyCache(id: PolicyBankId): PolicyRateRow | null {
  const mem = memory.get(id);
  if (mem) return mem.row;
  return readDisk().entries[id]?.row ?? null;
}

export function writeCache(row: PolicyRateRow): void {
  const now = Date.now();
  memory.set(row.id, { at: now, row });
  const disk = readDisk();
  disk.savedAt = new Date(now).toISOString();
  disk.entries[row.id] = { savedAt: disk.savedAt, row };
  writeDisk(disk);
}
