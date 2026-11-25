/**
 * Local tests for futures remote sync plumbing (no GitHub token required).
 * 1) Quality picker prefers CME over Yahoo
 * 2) HTTP remote hydrate serves the existing SWR envelope
 * 3) Worse live payload does not beat a stronger prior
 */
import { createServer } from "node:http";
import { readFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  fetchFuturesCurveRemoteEnvelope,
  futuresCurveQuality,
  pickBestFuturesCurve,
} from "../src/lib/commodities/futuresCurve.remote";
import type { FuturesTermStructure } from "../src/lib/commodities/futuresCurve";
import type { SwrDiskFile } from "../src/lib/commodities/swrCache";
import { __futuresCurveCacheTest } from "../src/lib/commodities/futuresCurve.cache";

const DISK = "data/cache/commodities-futures-curve.json";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const envelope = JSON.parse(readFileSync(DISK, "utf8")) as SwrDiskFile<FuturesTermStructure>;
assert(envelope.payload, "local cache missing payload");
assert(__futuresCurveCacheTest.usable(envelope.payload), "local cache not usable");

const cme = envelope.payload;
const yahooSparse: FuturesTermStructure = {
  ...cme,
  fetchedAt: new Date().toISOString(),
  curves: cme.curves.map((c, i) =>
    i < 4
      ? {
          ...c,
          enabled: true,
          sourceLabel: "Yahoo (fallback)",
          points: c.points.slice(0, 2).map((p, idx) => ({ ...p, price: idx === 0 ? 1 : 2 })),
          history: c.history.map((h) => ({
            ...h,
            source: "yahoo",
            points: h.points.slice(0, 2),
          })),
        }
      : {
          ...c,
          enabled: false,
          sourceLabel: "Yahoo (fallback)",
          points: [],
          history: [
            { horizon: "today", sessionDate: null, source: null, unavailableReason: "x", points: [] },
            { horizon: "1d", sessionDate: null, source: null, unavailableReason: "x", points: [] },
            { horizon: "1w", sessionDate: null, source: null, unavailableReason: "x", points: [] },
            { horizon: "1m", sessionDate: null, source: null, unavailableReason: "x", points: [] },
          ],
        },
  ),
};

const qCme = futuresCurveQuality(cme);
const qYahoo = futuresCurveQuality(yahooSparse);
assert(qCme > qYahoo, `expected CME quality ${qCme} > Yahoo ${qYahoo}`);
assert(pickBestFuturesCurve(yahooSparse, cme) === cme, "pickBest should keep CME over Yahoo");
assert(pickBestFuturesCurve(cme, yahooSparse) === cme, "pickBest order-independent for CME");
console.log("[ok] quality gate", { qCme, qYahoo });

const body = JSON.stringify(envelope);
const server = createServer((req, res) => {
  if (req.url?.startsWith("/futures-curve")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
assert(addr && typeof addr === "object", "server address");
const url = `http://127.0.0.1:${addr.port}/futures-curve.json`;
process.env.FUTURES_CURVE_REMOTE_URL = url;

const remote = await fetchFuturesCurveRemoteEnvelope();
assert(remote, "remote fetch failed");
assert(remote.version === __futuresCurveCacheTest.CACHE_VERSION, "remote version mismatch");
assert(remote.payload?.curves.length === 10, "expected 10 curves");
assert(
  remote.payload!.curves.every((c) => c.sourceLabel != null && c.sessionDate != null),
  "source/session missing",
);
console.log("[ok] remote fetch", {
  url,
  savedAt: remote.savedAt,
  sources: remote.payload!.curves.map((c) => `${c.id}:${c.sourceLabel}`),
});

// Simulate empty disk + remote hydrate via cache loader path
const bak = `${DISK}.test-bak`;
copyFileSync(DISK, bak);
try {
  unlinkSync(DISK);
  __futuresCurveCacheTest.clearMemory();
  const { getCachedFuturesTermStructure } = await import("../src/lib/commodities/futuresCurve.cache");
  const loaded = await getCachedFuturesTermStructure();
  assert(loaded.curves.length === 10, "hydrated curve count");
  assert(
    loaded.curves.filter((c) => c.enabled).length >= 8,
    "expected most curves enabled from remote",
  );
  // Disk should have been rewritten from remote
  assert(existsSync(DISK), "remote hydrate should seed disk");
  console.log("[ok] remote hydrate into empty cache", {
    enabled: loaded.curves.filter((c) => c.enabled).length,
    fromStale: loaded.fromStaleCache,
    frontGold: loaded.curves.find((c) => c.id === "gold")?.points.find((p) => p.price != null)?.label,
  });
} finally {
  copyFileSync(bak, DISK);
  try {
    unlinkSync(bak);
  } catch {
    /* ignore */
  }
  __futuresCurveCacheTest.clearMemory();
  server.close();
}

console.log("[ok] futures curve remote plumbing");
