/**
 * Process-local memory + disk cache with stale-while-revalidate.
 *
 * Fresh (age < cacheMs): return immediately (preserving any failure flag).
 * Expired but valid: return immediately without treating expiry as failure;
 *   kick one background refresh. fromStaleCache is set only when that refresh
 *   (or a blocking live load) actually fails, and sticks until a successful
 *   persist clears it.
 * Miss: await a single shared live load.
 *
 * Does not rewrite market timestamps inside payloads — callers must preserve
 * fetchedAt / asOf from the cached snapshot when serving stale copies.
 * Successful remote hydrate (e.g. GitHub Gist) is a valid load path and must
 * not be classified as a failed refresh; market-data age remains in payload
 * timestamps (sessionDate / asOf / fetchedAt).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type SwrDiskFile<T> = {
  version: number;
  savedAt: string;
  payload: T | null;
};

export type SwrCacheOptions<T> = {
  cacheMs: number;
  version: number;
  diskPath: string;
  usable: (payload: T | null | undefined) => payload is T;
  /** Stricter gate for writing; defaults to usable. */
  cacheWorthy?: (payload: T | null | undefined) => payload is T;
  loadLive: () => Promise<T>;
  mergeLive?: (live: T, prior: T | null) => T;
  /** Annotate a served snapshot after a genuine live refresh failure. */
  markStale: (payload: T) => T;
  /** Whether a live result should replace memory/disk. Defaults to cacheWorthy/usable. */
  shouldPersist?: (payload: T) => boolean;
  /** When a live result is not persisted, still return it on a blocking miss. Default true. */
  returnUnpersistedLive?: boolean;
  /**
   * Optional durable remote snapshot (same SwrDiskFile shape as disk).
   * Used when disk is empty (e.g. DigitalOcean) so the last verified dataset survives.
   */
  hydrateRemote?: () => Promise<{ savedAt: number; payload: T } | null>;
};

export type SwrCacheHandle<T> = {
  load: () => Promise<T>;
  /** Exposed for audits / tests. */
  getMemory: () => { savedAt: number; payload: T | null };
  clearMemory: () => void;
};

function readDiskFile<T>(
  diskPath: string,
  version: number,
  usable: (payload: T | null | undefined) => payload is T,
): { savedAt: number; payload: T } | null {
  try {
    if (!existsSync(diskPath)) return null;
    const raw = JSON.parse(readFileSync(diskPath, "utf8")) as SwrDiskFile<T>;
    if (raw?.version !== version || !usable(raw.payload)) return null;
    const savedAt = Date.parse(raw.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    return { savedAt, payload: raw.payload };
  } catch {
    return null;
  }
}

function writeDiskFile<T>(diskPath: string, version: number, savedAt: number, payload: T): void {
  try {
    const dir = dirname(diskPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: SwrDiskFile<T> = {
      version,
      savedAt: new Date(savedAt).toISOString(),
      payload,
    };
    writeFileSync(diskPath, JSON.stringify(file));
  } catch {
    // Live / memory payload remains usable if disk write fails.
  }
}

export function createSwrCache<T>(options: SwrCacheOptions<T>): SwrCacheHandle<T> {
  const cacheWorthy = options.cacheWorthy ?? options.usable;
  const shouldPersist =
    options.shouldPersist ?? ((payload: T) => cacheWorthy(payload));
  const returnUnpersistedLive = options.returnUnpersistedLive !== false;

  const memory: { savedAt: number; payload: T | null } = { savedAt: 0, payload: null };
  let liveInflight: Promise<{ payload: T | null; error: unknown }> | null = null;
  let diskHydrated = false;

  function hydrateFromDisk(): void {
    if (diskHydrated) return;
    diskHydrated = true;
    if (options.usable(memory.payload)) return;
    const disk = readDiskFile(options.diskPath, options.version, options.usable);
    if (!disk) return;
    memory.savedAt = disk.savedAt;
    memory.payload = disk.payload;
  }

  async function hydrateFromRemote(): Promise<void> {
    if (!options.hydrateRemote) return;
    if (options.usable(memory.payload)) return;
    try {
      const remote = await options.hydrateRemote();
      if (!remote || !options.usable(remote.payload)) return;
      // Successful remote retrieval (e.g. Gist) is a valid production source —
      // never classify it as a failed refresh. Market-data age stays in payload fields.
      memory.savedAt = remote.savedAt;
      memory.payload = asFreshEntry(remote.payload);
      if (cacheWorthy(memory.payload)) {
        writeDiskFile(options.diskPath, options.version, remote.savedAt, memory.payload);
      }
    } catch {
      // Remote is best-effort; live load may still succeed.
    }
  }

  function asFreshEntry(payload: T): T {
    // A successful live/remote load is a fresh cache entry. Nested upstream SWR flags
    // (e.g. signals built while indicators were expired) must not stick on disk
    // or every subsequent TTL hit would keep advertising "stale" forever.
    return { ...payload, fromStaleCache: false } as T;
  }

  function persist(payload: T): T {
    const stored = asFreshEntry(payload);
    const savedAt = Date.now();
    memory.savedAt = savedAt;
    memory.payload = stored;
    if (cacheWorthy(stored)) {
      writeDiskFile(options.diskPath, options.version, savedAt, stored);
    }
    return stored;
  }

  /**
   * Record a genuine live-refresh failure on the cached snapshot.
   * Does not bump savedAt (TTL / revalidate cadence must keep trying).
   */
  function markRefreshFailed(payload: T): T {
    const marked = options.markStale(payload);
    memory.payload = marked;
    if (options.usable(marked)) {
      writeDiskFile(options.diskPath, options.version, memory.savedAt, marked);
    }
    return marked;
  }

  function ageMs(savedAt: number, now: number): number {
    return now - savedAt;
  }

  async function runLive(prior: T | null): Promise<{ payload: T | null; error: unknown }> {
    if (liveInflight) return liveInflight;
    liveInflight = (async () => {
      try {
        const live = await options.loadLive();
        const merged = options.mergeLive ? options.mergeLive(live, prior) : live;
        if (shouldPersist(merged)) {
          return { payload: persist(merged), error: null };
        }
        return {
          payload: returnUnpersistedLive ? merged : null,
          error: null,
        };
      } catch (err) {
        return { payload: null, error: err };
      } finally {
        liveInflight = null;
      }
    })();
    return liveInflight;
  }

  function kickBackground(prior: T): void {
    // Capture generation so a later successful persist is not overwritten by a
    // lagged failure from an earlier in-flight attempt.
    const kickedSavedAt = memory.savedAt;
    void runLive(prior).then((result) => {
      const refreshFailed = result.error != null || result.payload == null;
      if (!refreshFailed) return;
      if (memory.savedAt !== kickedSavedAt) return;
      if (!options.usable(memory.payload)) return;
      markRefreshFailed(memory.payload);
    });
  }

  async function load(): Promise<T> {
    hydrateFromDisk();
    if (!options.usable(memory.payload)) {
      await hydrateFromRemote();
    }
    const now = Date.now();

    if (options.usable(memory.payload)) {
      const fresh = ageMs(memory.savedAt, now) < options.cacheMs;
      if (fresh) {
        // Within TTL: preserve fromStaleCache if a prior refresh failed — only a
        // successful persist may clear it.
        return memory.payload;
      }
      // Expired: serve the snapshot as-is (do not treat TTL expiry as failure).
      // Revalidate once in background; mark failure only if that attempt fails.
      const snapshot = memory.payload;
      kickBackground(snapshot);
      return snapshot;
    }

    // Blocking miss — await shared live load.
    const prior = null;
    const result = await runLive(prior);
    if (result.payload != null && (options.usable(result.payload) || returnUnpersistedLive)) {
      return result.payload;
    }

    // Live failed — try disk one more time (race with other writers).
    diskHydrated = false;
    hydrateFromDisk();
    if (options.usable(memory.payload)) {
      return markRefreshFailed(memory.payload);
    }

    if (result.error) throw result.error;
    throw new Error(`Cache miss and live load failed for ${options.diskPath}`);
  }

  return {
    load,
    getMemory: () => ({ savedAt: memory.savedAt, payload: memory.payload }),
    clearMemory: () => {
      memory.savedAt = 0;
      memory.payload = null;
      diskHydrated = false;
    },
  };
}
