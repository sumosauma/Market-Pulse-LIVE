/**
 * Publish the local futures-curve SWR envelope to a free durable GitHub Gist.
 *
 * One-time setup:
 *   1. Create a GitHub personal access token with "gist" scope.
 *   2. Set GITHUB_TOKEN in the environment.
 *   3. First run creates a gist and prints FUTURES_CURVE_REMOTE_URL for DigitalOcean.
 *   4. Subsequent runs update the same gist (set FUTURES_CURVE_GIST_ID).
 *
 * Daily (Task Scheduler / cron on the machine that can reach CME):
 *   npm run sync:futures-curve
 *
 * DigitalOcean env (no redeploy per day — set once):
 *   FUTURES_CURVE_REMOTE_URL=<stable raw gist URL printed by this script>
 *
 * Secret gists are unlisted, not private — DigitalOcean does not need a read token.
 * Does not commit to the app repo.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadFuturesTermStructure } from "../src/lib/commodities/futuresCurve.server";
import {
  futuresCurveQuality,
  pickBestFuturesCurve,
} from "../src/lib/commodities/futuresCurve.remote";
import type { FuturesTermStructure } from "../src/lib/commodities/futuresCurve";
import type { SwrDiskFile } from "../src/lib/commodities/swrCache";

const DISK_PATH = "data/cache/commodities-futures-curve.json";
const STATE_PATH = "data/cache/futures-curve-remote-sync.json";
const CACHE_VERSION = 14;
const GIST_FILENAME = process.env.FUTURES_CURVE_GIST_FILENAME?.trim() || "commodities-futures-curve.json";

type SyncState = {
  gistId: string;
  rawUrl: string;
  lastQuality: number;
  lastSavedAt: string;
};

function usable(payload: FuturesTermStructure | null | undefined): payload is FuturesTermStructure {
  return Boolean(
    payload?.curves.some(
      (curve) =>
        curve.enabled &&
        curve.points.length >= 2 &&
        Array.isArray(curve.history) &&
        curve.history.length === 4,
    ),
  );
}

function readDisk(): SwrDiskFile<FuturesTermStructure> | null {
  try {
    if (!existsSync(DISK_PATH)) return null;
    return JSON.parse(readFileSync(DISK_PATH, "utf8")) as SwrDiskFile<FuturesTermStructure>;
  } catch {
    return null;
  }
}

function writeDisk(envelope: SwrDiskFile<FuturesTermStructure>): void {
  const dir = dirname(DISK_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(DISK_PATH, JSON.stringify(envelope));
}

function readState(): SyncState | null {
  try {
    if (!existsSync(STATE_PATH)) return null;
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as SyncState;
  } catch {
    return null;
  }
}

function writeState(state: SyncState): void {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "MarketPulseFuturesCurveSync",
  };
}

/** Strip revision SHAs so the URL always resolves to the latest gist file contents. */
function toStableGistRawUrl(rawUrl: string, gistId: string, ownerLogin: string | undefined): string {
  const stripped = rawUrl.replace(/\/raw\/[a-f0-9]{40}\//i, "/raw/");
  if (stripped.includes(`/${GIST_FILENAME}`)) return stripped;
  if (ownerLogin) {
    return `https://gist.githubusercontent.com/${ownerLogin}/${gistId}/raw/${GIST_FILENAME}`;
  }
  return stripped;
}

function rawUrlForGist(gistId: string, ownerLogin: string | undefined): string {
  if (ownerLogin) {
    return `https://gist.githubusercontent.com/${ownerLogin}/${gistId}/raw/${GIST_FILENAME}`;
  }
  return `https://gist.githubusercontent.com/${gistId}/raw/${GIST_FILENAME}`;
}

async function upsertGist(
  token: string,
  gistId: string | null,
  content: string,
): Promise<{ id: string; rawUrl: string }> {
  if (!gistId) {
    const res = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Market Pulse futures curve SWR cache (authorized sync)",
        public: false,
        files: {
          [GIST_FILENAME]: { content },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`GitHub create gist failed: HTTP ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      id: string;
      owner?: { login?: string };
      files?: Record<string, { raw_url?: string }>;
    };
    const createdRaw = json.files?.[GIST_FILENAME]?.raw_url;
    const raw = createdRaw
      ? toStableGistRawUrl(createdRaw, json.id, json.owner?.login)
      : rawUrlForGist(json.id, json.owner?.login);
    return { id: json.id, rawUrl: raw };
  }

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub update gist failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    id: string;
    owner?: { login?: string };
    files?: Record<string, { raw_url?: string }>;
  };
  const apiRaw = json.files?.[GIST_FILENAME]?.raw_url;
  const raw = apiRaw
    ? toStableGistRawUrl(apiRaw, json.id, json.owner?.login)
    : rawUrlForGist(json.id, json.owner?.login);
  return { id: json.id, rawUrl: raw };
}

async function main() {
  const dryRun = process.env.FUTURES_CURVE_SYNC_DRY_RUN === "1";
  const force = process.env.FUTURES_CURVE_SYNC_FORCE === "1";
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!dryRun && !token) {
    throw new Error("Set GITHUB_TOKEN (gist scope) to publish the futures curve snapshot.");
  }

  console.log("[sync] refreshing futures curves from live sources…");
  const live = await loadFuturesTermStructure();
  const disk = readDisk();
  const best = pickBestFuturesCurve(live, disk?.payload) ?? live;
  if (!usable(best)) {
    throw new Error("[sync] refusing to publish: payload is not usable");
  }

  const quality = futuresCurveQuality(best);
  const state = readState();
  if (!force && state && quality < state.lastQuality) {
    console.log(
      JSON.stringify({
        ok: false,
        skipped: "lower_quality_than_last_publish",
        quality,
        lastQuality: state.lastQuality,
      }),
    );
    return;
  }

  const envelope: SwrDiskFile<FuturesTermStructure> = {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    payload: { ...best, fromStaleCache: false },
  };
  writeDisk(envelope);

  const summary = best.curves.map((c) => ({
    id: c.id,
    enabled: c.enabled,
    source: c.sourceLabel,
    session: c.sessionDate,
    priced: c.points.filter((p) => p.price != null).length,
  }));
  console.log("[sync] local envelope ready", { quality, curves: summary.length, savedAt: envelope.savedAt });

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, quality, summary }, null, 2));
    return;
  }

  const gistId = process.env.FUTURES_CURVE_GIST_ID?.trim() || state?.gistId || null;
  const { id, rawUrl } = await upsertGist(token!, gistId, JSON.stringify(envelope));
  writeState({
    gistId: id,
    rawUrl,
    lastQuality: quality,
    lastSavedAt: envelope.savedAt,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        gistId: id,
        quality,
        savedAt: envelope.savedAt,
        FUTURES_CURVE_REMOTE_URL: rawUrl,
        FUTURES_CURVE_GIST_ID: id,
        note: "Set FUTURES_CURVE_REMOTE_URL once on DigitalOcean. Secret gists are unlisted, not private — DO does not need a read token for the raw URL.",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
