/**
 * Durable remote snapshot of the futures-curve SWR envelope.
 *
 * Used so DigitalOcean can serve the last verified localhost dataset when CME
 * is unreachable, without daily git commits. Same JSON shape as
 * data/cache/commodities-futures-curve.json.
 *
 * Env:
 *   FUTURES_CURVE_REMOTE_URL — stable "latest" raw URL (no revision SHA), e.g.
 *     https://gist.githubusercontent.com/<user>/<id>/raw/commodities-futures-curve.json
 *
 * Secret (unlisted) Gists are readable by anyone with the raw URL — no token
 * required on DigitalOcean for GET. GITHUB_TOKEN is only needed on the publisher.
 */
import type { FuturesTermStructure } from "./futuresCurve";
import type { SwrDiskFile } from "./swrCache";

const FETCH_TIMEOUT_MS = 15_000;

export function futuresCurveRemoteUrl(): string | null {
  const url = process.env.FUTURES_CURVE_REMOTE_URL?.trim();
  return url || null;
}

/** Prefer official CME strips over sparse Yahoo fallbacks; require enabled curves. */
export function futuresCurveQuality(payload: FuturesTermStructure): number {
  let score = 0;
  for (const curve of payload.curves) {
    const priced = curve.points.filter((p) => p.price != null).length;
    if (!curve.enabled || priced < 2) continue;
    score += 100;
    score += Math.min(priced, 14);
    const src = curve.sourceLabel ?? "";
    if (src === "CME settlements" || src === "CME Daily Bulletin") score += 50;
    else if (src.startsWith("Yahoo")) score += 5;
    for (const h of curve.history ?? []) {
      const hp = h.points.filter((p) => p.price != null).length;
      if (hp > 0) score += 1;
    }
  }
  return score;
}

export function pickBestFuturesCurve(
  ...candidates: Array<FuturesTermStructure | null | undefined>
): FuturesTermStructure | null {
  const usable = candidates.filter((p): p is FuturesTermStructure =>
    Boolean(
      p?.curves.some(
        (c) =>
          c.enabled &&
          c.points.filter((x) => x.price != null).length >= 2 &&
          Array.isArray(c.history) &&
          c.history.length === 4,
      ),
    ),
  );
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    const q = futuresCurveQuality(b) - futuresCurveQuality(a);
    if (q !== 0) return q;
    return Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt);
  });
  return usable[0]!;
}

export async function fetchFuturesCurveRemoteEnvelope(): Promise<SwrDiskFile<FuturesTermStructure> | null> {
  const url = futuresCurveRemoteUrl();
  if (!url) return null;

  // No auth by default: secret gists are unlisted, not private; raw URLs work
  // anonymously. Optional token only if you later point at a truly private host.
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "MarketPulseFuturesCurveSync/1.0",
    // Avoid intermediary caches serving a pinned old revision of the gist raw file.
    "Cache-Control": "no-cache",
  };
  const token = process.env.FUTURES_CURVE_REMOTE_TOKEN?.trim();
  if (token) {
    headers.Authorization = token.startsWith("Bearer ") || token.startsWith("token ")
      ? token
      : `Bearer ${token}`;
  }

  // Bust CDN/revision caches so DO always sees the latest gist publish.
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}_ts=${Date.now()}`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Futures remote snapshot HTTP ${res.status}`);
  }
  const raw = (await res.json()) as SwrDiskFile<FuturesTermStructure>;
  if (!raw || typeof raw !== "object" || raw.payload == null) return null;
  if (typeof raw.version !== "number" || typeof raw.savedAt !== "string") return null;
  return raw;
}
