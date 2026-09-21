/** Shared official-file fetch for Cboe/STOXX EOD history. Retries; caches raw text. */

const FETCH_TIMEOUT_MS = 20_000;
const TEXT_CACHE_MS = 15 * 60 * 1000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type CacheEntry = { savedAt: number; text: string };
const textCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

let systemCaInstalled = false;

/** Node's bundled CAs reject the STOXX origin on some Windows hosts; the OS store does not. */
export async function ensureNodeSystemCa(): Promise<void> {
  if (systemCaInstalled) return;
  systemCaInstalled = true;
  try {
    const tls = await import("node:tls");
    if (typeof tls.getCACertificates === "function" && typeof tls.setDefaultCACertificates === "function") {
      tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
    }
  } catch {
    /* Workers / non-Node */
  }
}

export async function fetchOfficialText(
  url: string,
  accept: string,
  referer?: string,
): Promise<string | null> {
  const cached = textCache.get(url);
  if (cached && Date.now() - cached.savedAt <= TEXT_CACHE_MS) return cached.text;
  const pending = inflight.get(url);
  if (pending) return pending;

  const request = (async () => {
    await ensureNodeSystemCa();
    const headerSets: Record<string, string>[] = [
      { Accept: accept, "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
      { Accept: accept, "User-Agent": UA },
      { Accept: accept },
    ];
    for (const headers of headerSets) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers,
          redirect: "follow",
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (text.length > 0) {
          textCache.set(url, { savedAt: Date.now(), text });
          return text;
        }
      } catch {
        /* try next header set */
      }
    }
    return null;
  })();

  inflight.set(url, request);
  try {
    return await request;
  } finally {
    inflight.delete(url);
  }
}
