/**
 * Persist successful CME settlement strips for historical curve comparison.
 * Disk in local/dev; Cloudflare KV (FUTURES_SNAPSHOTS) when the binding exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DISK_PATH = "data/cache/futures-curve-snapshots.json";
const MAX_SESSIONS_PER_CURVE = 70;
const FILE_VERSION = 1;

export type SnapshotRow = {
  year: number;
  monthIndex: number;
  price: number;
  volume: number;
  openInterest: number;
};

export type CurveSessionSnapshot = {
  sessionDate: string;
  rows: SnapshotRow[];
  savedAt: string;
};

type SnapshotFile = {
  version: number;
  curves: Record<string, CurveSessionSnapshot[]>;
};

type KvLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

function emptyFile(): SnapshotFile {
  return { version: FILE_VERSION, curves: {} };
}

function getKv(): KvLike | null {
  try {
    const g = globalThis as { FUTURES_SNAPSHOTS?: KvLike; env?: { FUTURES_SNAPSHOTS?: KvLike } };
    return g.FUTURES_SNAPSHOTS ?? g.env?.FUTURES_SNAPSHOTS ?? null;
  } catch {
    return null;
  }
}

async function readStore(): Promise<SnapshotFile> {
  const kv = getKv();
  if (kv) {
    try {
      const raw = await kv.get("futures-curve-snapshots");
      if (!raw) return emptyFile();
      const parsed = JSON.parse(raw) as SnapshotFile;
      if (parsed?.version !== FILE_VERSION || !parsed.curves) return emptyFile();
      return parsed;
    } catch {
      return emptyFile();
    }
  }
  try {
    if (!existsSync(DISK_PATH)) return emptyFile();
    const parsed = JSON.parse(readFileSync(DISK_PATH, "utf8")) as SnapshotFile;
    if (parsed?.version !== FILE_VERSION || !parsed.curves) return emptyFile();
    return parsed;
  } catch {
    return emptyFile();
  }
}

async function writeStore(file: SnapshotFile): Promise<void> {
  const body = JSON.stringify(file);
  const kv = getKv();
  if (kv) {
    try {
      await kv.put("futures-curve-snapshots", body);
      return;
    } catch {
      // fall through to disk
    }
  }
  try {
    const dir = dirname(DISK_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DISK_PATH, body);
  } catch {
    // Snapshots are best-effort.
  }
}

function prune(sessions: CurveSessionSnapshot[]): CurveSessionSnapshot[] {
  const byDate = new Map<string, CurveSessionSnapshot>();
  for (const session of sessions) {
    if (!session.sessionDate || !Array.isArray(session.rows) || session.rows.length === 0) continue;
    byDate.set(session.sessionDate, session);
  }
  return [...byDate.values()]
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    .slice(0, MAX_SESSIONS_PER_CURVE);
}

export async function readCurveSnapshot(
  curveId: string,
  sessionDate: string,
): Promise<CurveSessionSnapshot | null> {
  const file = await readStore();
  const sessions = file.curves[curveId] ?? [];
  return sessions.find((session) => session.sessionDate === sessionDate) ?? null;
}

/** Find the nearest snapshot on or before targetIso (within maxLookback calendar days). */
export async function findCurveSnapshotOnOrBefore(
  curveId: string,
  targetIso: string,
  maxLookbackDays = 4,
): Promise<CurveSessionSnapshot | null> {
  const file = await readStore();
  const sessions = [...(file.curves[curveId] ?? [])].sort((a, b) =>
    b.sessionDate.localeCompare(a.sessionDate),
  );
  for (const session of sessions) {
    if (session.sessionDate > targetIso) continue;
    const a = Date.parse(`${session.sessionDate}T00:00:00Z`);
    const b = Date.parse(`${targetIso}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lag = Math.round((b - a) / 86_400_000);
    if (lag >= 0 && lag <= maxLookbackDays) return session;
  }
  return null;
}

export async function saveCurveSnapshot(
  curveId: string,
  sessionDate: string,
  rows: SnapshotRow[],
): Promise<void> {
  if (!sessionDate || rows.length === 0) return;
  const file = await readStore();
  const existing = file.curves[curveId] ?? [];
  const next: CurveSessionSnapshot = {
    sessionDate,
    rows,
    savedAt: new Date().toISOString(),
  };
  file.curves[curveId] = prune([next, ...existing.filter((row) => row.sessionDate !== sessionDate)]);
  await writeStore(file);
}
