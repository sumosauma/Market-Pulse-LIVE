import { createServerFn } from "@tanstack/react-start";
import { isObservationStale, monthKey, preferNewerObservationDate, shouldReuseCachedSnapshot } from "./freshness";
import {
  computeIndexYoYMoM,
  computePayemsChange,
  computeUnemploymentLevel,
  filterReleasedFredObservations,
} from "./fredSeries";
import {
  CHANGE_LABEL_FROM_PREVIOUS,
  formatIndexDelta,
  formatIndexLevel,
  formatPanelDate,
  formatMetadataLine,
  formatChangeReferenceMonth,
  formatMoMSecondary,
  formatPct,
  formatPpDelta,
  formatYoYHeadline,
  scbMonthToIso,
  type MacroChangeDirection,
} from "./format";
import {
  consensusFromCalendarRows,
  emptyConsensus,
  type ConsensusSnapshot,
} from "./teConsensus";
import { fetchTeCalendarRows, type TeCalendarRow } from "./teCalendar";
import { fetchIsmPmiSnapshot, ismKindForIndicator } from "./ismPmi";
import { getNextRelease, type NextReleaseInfo } from "./nextRelease";
import { fetchScbKpif, fetchScbUnemployment } from "./scbPxWeb";
import {
  MACRO_INDICATOR_ORDER,
  MACRO_CONSENSUS_IDS,
  MACRO_PULSE_SCHEMA_VERSION,
  type MacroIndicatorMeta,
  type MacroPulseFreshness,
  type MacroPulseIndicatorId,
  type MacroPulsePayload,
  type MacroPulseRow,
} from "./types";

const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;
const DISK_CACHE_PATH = "data/cache/macro-pulse.json";
const FRED_OBS_LIMIT = 16;

type RowSnapshot = Readonly<{
  headlineValue: string;
  headlineYoY?: number | null;
  changeVsPriorDisplay: string | null;
  changeSecondaryValue: string | null;
  changeVsPriorDirection: MacroChangeDirection | null;
  secondaryValue: string | null;
  observationDate: string;
  sourceUrl?: string;
  nextRelease?: NextReleaseInfo | null;
  consensus?: ConsensusSnapshot | null;
}>;

type DiskCacheFile = {
  savedAt: string;
  schemaVersion?: number;
  snapshots: Partial<Record<string, RowSnapshot>>;
};

let memoryCache: {
  at: number;
  payload: MacroPulsePayload;
  snapshots: Partial<Record<string, RowSnapshot>>;
} | null = null;

function isUsableDiskSnapshot(snap: RowSnapshot | undefined): snap is RowSnapshot {
  return Boolean(
    snap?.observationDate &&
      snap.headlineValue &&
      snap.changeVsPriorDisplay != null &&
      snap.changeVsPriorDisplay.length > 0,
  );
}

function filterUsableDiskSnapshots(
  snapshots: Partial<Record<string, RowSnapshot>> | undefined,
): Partial<Record<string, RowSnapshot>> {
  if (!snapshots) return {};
  const usable: Partial<Record<string, RowSnapshot>> = {};
  for (const [id, snap] of Object.entries(snapshots)) {
    if (isUsableDiskSnapshot(snap)) {
      usable[id] = snap;
    }
  }
  return usable;
}

function memoryCacheIsReusable(payload: MacroPulsePayload, cachedAt: number, now: Date): boolean {
  if (!payloadHasRequiredFields(payload)) return false;
  return payload.rows.every((row) =>
    shouldReuseCachedSnapshot({
      cachedAt,
      now,
      ttlMs: MEMORY_CACHE_MS,
      indicatorId: row.id,
      observationDate: row.observationDate,
      nextReleaseDate: row.nextReleaseDate,
    }),
  );
}

function payloadHasRequiredFields(payload: MacroPulsePayload): boolean {
  if (payload.schemaVersion !== MACRO_PULSE_SCHEMA_VERSION) return false;
  return payload.rows.every((row) => {
    if (row.headlineValue == null || row.freshness === "error") return true;
    return Boolean(
      row.changeVsPriorDisplay &&
        row.changeReferenceDisplay &&
        row.metadataDisplay &&
        row.nextReleaseDisplay,
    );
  });
}

function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function fetchFredMonthly(seriesId: string, now = new Date()) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${FRED_OBS_LIMIT}`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  const parsed = filterReleasedFredObservations(
    (json?.observations ?? [])
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o) => !Number.isNaN(o.value)),
    now,
  );
  if (!parsed.length) throw new Error("No FRED data");
  return parsed.reverse();
}

function pickNewerSnapshot(primary: RowSnapshot | undefined, fallback: RowSnapshot | undefined): RowSnapshot | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return preferNewerObservationDate(primary.observationDate, fallback.observationDate) === "primary"
    ? primary
    : fallback;
}

async function fetchIndicatorSnapshot(meta: MacroIndicatorMeta): Promise<RowSnapshot> {
  switch (meta.id) {
    case "us-core-cpi":
      return computeIndexYoYMoM(await fetchFredMonthly("CPILFESL"));
    case "us-core-pce":
      return computeIndexYoYMoM(await fetchFredMonthly("PCEPILFE"));
    case "ea-core-hicp":
      return computeIndexYoYMoM(await fetchFredMonthly("TOTNRGFOODEA20MI15XM"));
    case "us-nfp":
      return computePayemsChange(await fetchFredMonthly("PAYEMS"));
    case "us-unemployment":
      return computeUnemploymentLevel(await fetchFredMonthly("UNRATE"));
    case "se-kpif": {
      const kpif = await fetchScbKpif();
      const yoyDelta = kpif.previousYoy !== null ? kpif.yoy - kpif.previousYoy : null;
      const change = yoyDelta !== null ? formatPpDelta(yoyDelta) : null;
      return {
        headlineValue: formatYoYHeadline(kpif.yoy),
        headlineYoY: kpif.yoy,
        changeVsPriorDisplay: change?.value ?? null,
        changeSecondaryValue: change ? CHANGE_LABEL_FROM_PREVIOUS : null,
        changeVsPriorDirection: change?.direction ?? null,
        secondaryValue: formatMoMSecondary(kpif.mom),
        observationDate: scbMonthToIso(kpif.observationMonth),
      };
    }
    case "se-unemployment": {
      const unemp = await fetchScbUnemployment();
      const change = formatPpDelta(unemp.level - unemp.previousLevel);
      return {
        headlineValue: formatPct(unemp.level),
        changeVsPriorDisplay: change.value,
        changeSecondaryValue: CHANGE_LABEL_FROM_PREVIOUS,
        changeVsPriorDirection: change.direction,
        secondaryValue: null,
        observationDate: scbMonthToIso(unemp.observationMonth),
      };
    }
    default:
      throw new Error(`Unknown indicator: ${meta.id}`);
  }
}

import type { IsmPmiSnapshot } from "./ismPmi";

export function ismSnapshotToRowSnapshot(snapshot: IsmPmiSnapshot): RowSnapshot {
  const delta = snapshot.latest - snapshot.previous;
  const change = formatIndexDelta(delta);
  const nextRelease =
    snapshot.nextReleaseDate != null
      ? {
          display: formatPanelDate(snapshot.nextReleaseDate),
          isEstimated: snapshot.nextReleaseIsEstimated,
          dateIso: snapshot.nextReleaseDate,
        }
      : null;
  return {
    headlineValue: formatIndexLevel(snapshot.latest),
    changeVsPriorDisplay: change.value,
    changeSecondaryValue: CHANGE_LABEL_FROM_PREVIOUS,
    changeVsPriorDirection: change.direction,
    secondaryValue: "Index",
    observationDate: snapshot.observationDate,
    sourceUrl: snapshot.reportUrl,
    nextRelease,
  };
}

function resolveFreshness(
  liveOk: boolean,
  fromCache: boolean,
  observationDate: string | null,
  indicatorId: MacroIndicatorMeta["id"],
  now: Date,
): MacroPulseFreshness {
  if (!observationDate) return "error";
  const stale = isObservationStale(indicatorId, observationDate, now);
  if (liveOk) return stale ? "stale" : "fresh";
  if (fromCache) return stale ? "stale" : "cached";
  return "error";
}

function isConsensusId(id: MacroPulseIndicatorId): boolean {
  return (MACRO_CONSENSUS_IDS as readonly string[]).includes(id);
}

async function enrichWithConsensus(
  meta: MacroIndicatorMeta,
  snap: RowSnapshot,
  calendarRows: readonly TeCalendarRow[],
  now: Date,
  fallbackConsensus?: ConsensusSnapshot | null,
): Promise<RowSnapshot> {
  if (!isConsensusId(meta.id)) return snap;
  try {
    const consensus = await consensusFromCalendarRows(
      meta.id,
      meta.displayKind,
      snap.observationDate,
      calendarRows,
      now,
    );
    if (
      consensus.forecast === null &&
      calendarRows.length === 0 &&
      fallbackConsensus?.forecast != null &&
      fallbackConsensus.observationMonth === consensus.observationMonth
    ) {
      return { ...snap, consensus: fallbackConsensus };
    }
    return { ...snap, consensus };
  } catch {
    if (fallbackConsensus) return { ...snap, consensus: fallbackConsensus };
    if (snap.consensus) return snap;
    return { ...snap, consensus: emptyConsensus(meta.id) };
  }
}

function emptyRow(meta: MacroIndicatorMeta, freshness: MacroPulseFreshness, error: string): MacroPulseRow {
  return {
    id: meta.id,
    section: meta.section,
    label: meta.label,
    displayKind: meta.displayKind,
    headlineValue: null,
    consensusDisplay: null,
    nextReleaseConsensusDisplay: null,
    consensusRevisionDisplay: null,
    consensusRevisionDirection: null,
    consensusSourceUrl: null,
    changeVsPriorDisplay: null,
    changeSecondaryValue: null,
    changeReferenceDisplay: null,
    changeVsPriorDirection: null,
    secondaryValue: null,
    metadataDisplay: null,
    nextReleaseDisplay: null,
    nextReleaseIsEstimated: false,
    nextReleaseDate: null,
    observationDate: null,
    source: meta.source,
    sourceSeriesId: meta.sourceSeriesId,
    sourceUrl: meta.sourceUrl,
    freshness,
    error,
  };
}

function changeReferenceForSnapshot(snap: RowSnapshot): string | null {
  if (!snap.changeVsPriorDisplay) return null;
  return formatChangeReferenceMonth(snap.observationDate);
}

async function snapshotToRow(
  meta: MacroIndicatorMeta,
  snap: RowSnapshot,
  freshness: MacroPulseFreshness,
  now: Date,
): Promise<MacroPulseRow> {
  const nextRelease = await getNextRelease(meta.id, snap.observationDate, now, snap.nextRelease);
  return {
    id: meta.id,
    section: meta.section,
    label: meta.label,
    displayKind: meta.displayKind,
    headlineValue: snap.headlineValue,
    consensusDisplay: snap.consensus?.forecastDisplay ?? null,
    nextReleaseConsensusDisplay: snap.consensus?.nextReleaseConsensusDisplay ?? null,
    consensusRevisionDisplay: snap.consensus?.revisionDisplay ?? null,
    consensusRevisionDirection: snap.consensus?.revisionDirection ?? null,
    consensusSourceUrl: snap.consensus?.sourceUrl ?? null,
    changeVsPriorDisplay: snap.changeVsPriorDisplay,
    changeSecondaryValue: snap.changeSecondaryValue,
    changeReferenceDisplay: changeReferenceForSnapshot(snap),
    changeVsPriorDirection: snap.changeVsPriorDirection,
    secondaryValue: snap.secondaryValue,
    metadataDisplay: formatMetadataLine(snap.observationDate, meta.source),
    nextReleaseDisplay: nextRelease.display,
    nextReleaseIsEstimated: nextRelease.isEstimated,
    nextReleaseDate: nextRelease.dateIso ?? null,
    observationDate: snap.observationDate,
    source: meta.source,
    sourceSeriesId: meta.sourceSeriesId,
    sourceUrl: snap.sourceUrl ?? meta.sourceUrl,
    freshness,
    error: null,
  };
}

function readDiskCache(): DiskCacheFile | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("path") as typeof import("path");
    const fp = join(DISK_CACHE_PATH);
    if (!existsSync(fp)) return null;
    const raw = JSON.parse(readFileSync(fp, "utf8")) as DiskCacheFile;
    if (!raw?.snapshots || typeof raw.savedAt !== "string") return null;
    if (raw.schemaVersion !== MACRO_PULSE_SCHEMA_VERSION) return null;
    return {
      savedAt: raw.savedAt,
      schemaVersion: MACRO_PULSE_SCHEMA_VERSION,
      snapshots: filterUsableDiskSnapshots(raw.snapshots),
    };
  } catch {
    return null;
  }
}

function writeDiskCache(snapshots: Partial<Record<string, RowSnapshot>>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync, mkdirSync, existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dirname, join } = require("path") as typeof import("path");
    const fp = join(DISK_CACHE_PATH);
    const dir = dirname(fp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      fp,
      JSON.stringify(
        { savedAt: new Date().toISOString(), schemaVersion: MACRO_PULSE_SCHEMA_VERSION, snapshots },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* Workers / read-only filesystem */
  }
}

async function loadMacroPulse(
  lastGood: Partial<Record<string, RowSnapshot>> = {},
): Promise<{ payload: MacroPulsePayload; snapshots: Partial<Record<string, RowSnapshot>> }> {
  const now = new Date();
  const disk = readDiskCache();
  const liveSnapshots: Partial<Record<string, RowSnapshot>> = { ...(disk?.snapshots ?? {}) };
  for (const [id, snap] of Object.entries(lastGood)) {
    liveSnapshots[id] = pickNewerSnapshot(snap, liveSnapshots[id]) ?? snap;
  }
  const pending: Array<{
    meta: MacroIndicatorMeta;
    snap: RowSnapshot;
    liveOk: boolean;
  }> = [];
  const rows: MacroPulseRow[] = [];
  const calendarPromise = fetchTeCalendarRows(now).catch(() => [] as TeCalendarRow[]);

  await Promise.all(
    MACRO_INDICATOR_ORDER.map(async (meta) => {
      try {
        let snap: RowSnapshot;
        let liveOk = true;
        const ismKind = ismKindForIndicator(meta.id);
        if (ismKind) {
          const { snapshot, fromCache } = await fetchIsmPmiSnapshot(ismKind, now);
          snap = ismSnapshotToRowSnapshot(snapshot);
          liveOk = !fromCache;
        } else {
          snap = await fetchIndicatorSnapshot(meta);
        }
        const cached = pickNewerSnapshot(lastGood[meta.id], disk?.snapshots?.[meta.id]);
        if (
          cached &&
          preferNewerObservationDate(snap.observationDate, cached.observationDate) === "fallback"
        ) {
          snap = cached;
          liveOk = false;
        }
        pending.push({ meta, snap, liveOk });
      } catch (err) {
        const cached = pickNewerSnapshot(lastGood[meta.id], disk?.snapshots?.[meta.id]);
        if (isUsableDiskSnapshot(cached)) {
          pending.push({ meta, snap: cached, liveOk: false });
        } else {
          rows.push(
            emptyRow(meta, "error", err instanceof Error ? err.message : "Fetch failed"),
          );
        }
      }
    }),
  );

  const calendarRows = await calendarPromise;

  for (const { meta, snap, liveOk } of pending) {
    const cached = liveSnapshots[meta.id];
    const consensusMonth = monthKey(snap.observationDate);
    const cachedConsensus =
      cached?.consensus?.observationMonth === consensusMonth
        ? cached.consensus
        : lastGood[meta.id]?.consensus?.observationMonth === consensusMonth
          ? lastGood[meta.id]?.consensus
          : null;
    const enriched = await enrichWithConsensus(meta, snap, calendarRows, now, cachedConsensus);
    liveSnapshots[meta.id] = enriched;
    const freshness = resolveFreshness(liveOk, !liveOk, enriched.observationDate, meta.id, now);
    rows.push(await snapshotToRow(meta, enriched, freshness, now));
  }

  writeDiskCache(liveSnapshots);

  const ordered = MACRO_INDICATOR_ORDER.map(
    (meta) => rows.find((r) => r.id === meta.id) ?? emptyRow(meta, "error", "Missing row"),
  );

  return {
    payload: {
      schemaVersion: MACRO_PULSE_SCHEMA_VERSION,
      rows: ordered,
      fetchedAt: now.toISOString(),
    },
    snapshots: liveSnapshots,
  };
}

export async function getMacroPulsePayload(): Promise<MacroPulsePayload> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  if (memoryCache && memoryCacheIsReusable(memoryCache.payload, memoryCache.at, now)) {
    return memoryCache.payload;
  }
  const previousSnapshots = memoryCache?.snapshots ?? {};
  const { payload, snapshots } = await loadMacroPulse(previousSnapshots);
  memoryCache = { at: nowMs, payload, snapshots };
  return payload;
}

export const getMacroPulse = createServerFn({ method: "GET" }).handler(async (): Promise<MacroPulsePayload> => {
  return getMacroPulsePayload();
});
