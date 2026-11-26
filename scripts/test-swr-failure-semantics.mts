/**
 * Regression: fromStaleCache is failure-only (not TTL expiry).
 *
 * Scenarios:
 * 1. Normal TTL expiry + successful background refresh → never fromStaleCache
 * 2. Failed background refresh with cached data → fromStaleCache sticks
 * 3. Successful recovery after failure → flag clears
 * 4. Fresh / outdated Gist snapshots → valid source; market age is sessionDate
 * 5. Multiple simultaneous revalidations → single live load, no false failure
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createSwrCache, type SwrDiskFile } from "../src/lib/commodities/swrCache";

type Payload = {
  value: number;
  fetchedAt: string;
  sessionDate: string;
  fromStaleCache: boolean;
};

const ROOT = join("data", "cache", "_swr-failure-semantics");
const CACHE_MS = 50;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function diskPath(name: string): string {
  return join(ROOT, `${name}.json`);
}

function makePayload(value: number, sessionDate: string): Payload {
  return {
    value,
    fetchedAt: new Date().toISOString(),
    sessionDate,
    fromStaleCache: false,
  };
}

function usable(p: Payload | null | undefined): p is Payload {
  return Boolean(p && typeof p.value === "number" && typeof p.fetchedAt === "string");
}

async function waitUntil(
  pred: () => boolean,
  label: string,
  timeoutMs = 2_000,
): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(20);
  }
}

function resetDir(): void {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
}

resetDir();

// --- 1) TTL expiry + successful background refresh ---
{
  let liveCalls = 0;
  const path = diskPath("s1");
  const cache = createSwrCache<Payload>({
    cacheMs: CACHE_MS,
    version: 1,
    diskPath: path,
    usable,
    loadLive: async () => {
      liveCalls += 1;
      return makePayload(liveCalls, "2026-11-25");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
  });

  const first = await cache.load();
  assert(first.fromStaleCache === false, "s1: first load must be fresh");
  assert(first.value === 1, "s1: first live value");
  await sleep(CACHE_MS + 20);
  const expired = await cache.load();
  assert(expired.fromStaleCache === false, "s1: TTL expiry must not set fromStaleCache");
  assert(expired.value === 1, "s1: serve prior snapshot while revalidating");
  await waitUntil(() => cache.getMemory().payload?.value === 2, "s1 background refresh");
  const after = await cache.load();
  assert(after.fromStaleCache === false, "s1: post-refresh still not failed");
  assert(after.value === 2, "s1: refreshed value");
  console.log("[ok] 1 TTL expiry + successful refresh", { liveCalls, after: after.value });
}

// --- 2) Failed background refresh keeps failure flag ---
{
  let liveCalls = 0;
  const path = diskPath("s2");
  const cache = createSwrCache<Payload>({
    cacheMs: CACHE_MS,
    version: 1,
    diskPath: path,
    usable,
    loadLive: async () => {
      liveCalls += 1;
      if (liveCalls === 1) return makePayload(1, "2026-11-25");
      throw new Error("simulated provider outage");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
  });

  await cache.load();
  await sleep(CACHE_MS + 20);
  const expired = await cache.load();
  assert(expired.fromStaleCache === false, "s2: expiry alone is not failure");
  await waitUntil(
    () => Boolean(cache.getMemory().payload?.fromStaleCache),
    "s2 failure flag after background error",
  );
  const failed = await cache.load();
  assert(failed.fromStaleCache === true, "s2: failed refresh must set fromStaleCache");
  assert(failed.value === 1, "s2: still serving cached value");
  const again = await cache.load();
  assert(again.fromStaleCache === true, "s2: failure preserved across subsequent requests");
  console.log("[ok] 2 failed refresh preserves flag", { liveCalls, value: again.value });
}

// --- 3) Recovery clears failure ---
{
  let liveCalls = 0;
  const path = diskPath("s3");
  const cache = createSwrCache<Payload>({
    cacheMs: CACHE_MS,
    version: 1,
    diskPath: path,
    usable,
    loadLive: async () => {
      liveCalls += 1;
      if (liveCalls === 1) return makePayload(1, "2026-11-25");
      if (liveCalls === 2) throw new Error("transient outage");
      return makePayload(3, "2026-11-25");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
  });

  await cache.load();
  await sleep(CACHE_MS + 20);
  await cache.load();
  await waitUntil(
    () => Boolean(cache.getMemory().payload?.fromStaleCache),
    "s3 failure flag",
  );
  assert((await cache.load()).fromStaleCache === true, "s3: still failed before recovery");

  await sleep(CACHE_MS + 20);
  await cache.load();
  await waitUntil(
    () => cache.getMemory().payload?.value === 3 && !cache.getMemory().payload?.fromStaleCache,
    "s3 recovery",
  );
  const recovered = await cache.load();
  assert(recovered.fromStaleCache === false, "s3: successful refresh clears failure");
  assert(recovered.value === 3, "s3: recovered value");
  console.log("[ok] 3 recovery after failure", { liveCalls, value: recovered.value });
}

// --- 4) Gist hydrate: envelope savedAt is publish time; sessionDate is market age ---
{
  // Outdated settlement (Friday) published freshly over the weekend — valid production source.
  const fridaySession = "2026-11-21";
  const outdatedButPublishedNow: SwrDiskFile<Payload> = {
    version: 1,
    savedAt: new Date().toISOString(),
    payload: {
      value: 42,
      fetchedAt: new Date().toISOString(),
      sessionDate: fridaySession,
      fromStaleCache: false,
    },
  };

  let liveCalls = 0;
  const path = diskPath("s4-outdated-settlement");
  const cache = createSwrCache<Payload>({
    cacheMs: 60_000,
    version: 1,
    diskPath: path,
    usable,
    loadLive: async () => {
      liveCalls += 1;
      throw new Error("live CME unreachable — remote should have hydrated first");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
    hydrateRemote: async () => ({
      savedAt: Date.parse(outdatedButPublishedNow.savedAt),
      payload: outdatedButPublishedNow.payload!,
    }),
  });

  const loaded = await cache.load();
  assert(loaded.fromStaleCache === false, "s4: Gist hydrate must not be classified as failed refresh");
  assert(loaded.value === 42, "s4: gist value served");
  assert(loaded.sessionDate === fridaySession, "s4: settlement/session age stays on payload");
  assert(liveCalls === 0, "s4: fresh gist savedAt is within TTL — no live kick");
  assert(existsSync(path), "s4: remote seeds disk");
  console.log("[ok] 4 outdated settlement via fresh Gist publish", {
    sessionDate: loaded.sessionDate,
    fromStaleCache: loaded.fromStaleCache,
  });

  // Stale envelope age (old savedAt) that still hydrates, then live preferring remote succeeds
  // (mirrors loadLivePreferringRemote picking Gist when CME is down).
  const pathOldEnv = diskPath("s4-old-envelope");
  const oldEnvelopeSavedAt = Date.now() - 2 * 60 * 60 * 1000;
  let preferRemoteCalls = 0;
  const cacheOld = createSwrCache<Payload>({
    cacheMs: 60_000,
    version: 1,
    diskPath: pathOldEnv,
    usable,
    loadLive: async () => {
      preferRemoteCalls += 1;
      // Successful Gist retrieval during live path — valid, even with Friday session.
      return {
        value: 77,
        fetchedAt: new Date().toISOString(),
        sessionDate: fridaySession,
        fromStaleCache: false,
      };
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
    hydrateRemote: async () => ({
      savedAt: oldEnvelopeSavedAt,
      payload: {
        value: 70,
        fetchedAt: new Date(oldEnvelopeSavedAt).toISOString(),
        sessionDate: fridaySession,
        fromStaleCache: false,
      },
    }),
  });

  const fromOld = await cacheOld.load();
  // Hydrate then TTL-miss kicks live; live returns Gist-quality payload → persist clears failure.
  await waitUntil(
    () => cacheOld.getMemory().payload?.value === 77,
    "s4 old-envelope live preferring remote",
  );
  const afterLive = await cacheOld.load();
  assert(afterLive.fromStaleCache === false, "s4: successful remote-preferring live is not failure");
  assert(afterLive.sessionDate === fridaySession, "s4: weekend settlement date preserved");
  assert(preferRemoteCalls >= 1, "s4: live path ran after expired hydrate");
  // Immediate hydrate return before background may have been value 70 without failure flag
  assert(fromOld.fromStaleCache === false, "s4: serving hydrated gist during revalidate is not failure");
  console.log("[ok] 4b expired Gist envelope + successful prefer-remote live", {
    preferRemoteCalls,
    value: afterLive.value,
    sessionDate: afterLive.sessionDate,
  });

  const pathFresh = diskPath("s4-fresh");
  const cacheFresh = createSwrCache<Payload>({
    cacheMs: 60_000,
    version: 1,
    diskPath: pathFresh,
    usable,
    loadLive: async () => {
      throw new Error("should not live-load");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
    hydrateRemote: async () => ({
      savedAt: Date.now(),
      payload: makePayload(99, "2026-11-25"),
    }),
  });
  const fresh = await cacheFresh.load();
  assert(fresh.fromStaleCache === false, "s4-fresh: not failed");
  assert(fresh.value === 99, "s4-fresh: value");
  console.log("[ok] 4c fresh Gist hydrate", { value: fresh.value });
}

// --- 5) Multiple simultaneous revalidations share one live load ---
{
  let liveCalls = 0;
  let releaseLive!: () => void;
  let liveStarted!: () => void;
  let gate = new Promise<void>((r) => {
    releaseLive = r;
  });

  const path = diskPath("s5");
  const cache = createSwrCache<Payload>({
    cacheMs: CACHE_MS,
    version: 1,
    diskPath: path,
    usable,
    loadLive: async () => {
      liveCalls += 1;
      liveStarted();
      await gate;
      return makePayload(100 + liveCalls, "2026-11-25");
    },
    markStale: (p) => ({ ...p, fromStaleCache: true }),
  });

  // Seed: gate already open.
  liveStarted = () => {};
  releaseLive();
  const seed = await cache.load();
  assert(seed.fromStaleCache === false, "s5: seed fresh");
  assert(liveCalls === 1, "s5: one seed live call");
  assert(seed.value === 101, "s5: seed value");

  gate = new Promise<void>((r) => {
    releaseLive = r;
  });
  const started2 = new Promise<void>((r) => {
    liveStarted = r;
  });

  await sleep(CACHE_MS + 20);
  const parallel = await Promise.all([
    cache.load(),
    cache.load(),
    cache.load(),
    cache.load(),
  ]);
  assert(
    parallel.every((p) => p.fromStaleCache === false && p.value === seed.value),
    "s5: concurrent expiry returns prior without failure flag",
  );
  await started2;
  assert(liveCalls === 2, "s5: concurrent revalidations share one live load");
  releaseLive();
  await waitUntil(() => cache.getMemory().payload?.value === 102, "s5 refresh complete");
  const done = await cache.load();
  assert(done.fromStaleCache === false, "s5: no false failure after multi revalidate");
  assert(done.value === 102, "s5: refreshed once");
  console.log("[ok] 5 simultaneous revalidations", { liveCalls, value: done.value });
}

rmSync(ROOT, { recursive: true, force: true });
console.log("[ok] all SWR failure-semantics scenarios passed");
