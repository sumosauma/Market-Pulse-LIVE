import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { loadCommodityOverview } from "./overview.server";
import type { CommodityOverview, CommodityQuote } from "./overview";

const DISK_CACHE_PATH = "data/cache/commodities-overview.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped after Avanza unified Last/1D%/history for Brent, WTI, Nat Gas, Gold, Silver. */
const CACHE_VERSION = 10;
/** Don't treat a mostly-empty overview as a successful cache hit. */
const MIN_PRICED_QUOTES = 6;
/** Price History panel instruments that must not be cached without a live Avanza Last. */
const REQUIRED_AVANZA_IDS = ["brent", "wti", "henry-hub", "gold", "silver"] as const;

export const COMMODITIES_OVERVIEW_QUERY_KEY = ["commodities-overview", "v10"] as const;

type DiskCacheFile = {
  version: number;
  savedAt: string;
  payload: CommodityOverview | null;
};

const memory: { savedAt: number; payload: CommodityOverview | null } = {
  savedAt: 0,
  payload: null,
};

let inflight: Promise<CommodityOverview> | null = null;

function priceCount(overview: CommodityOverview): number {
  return overview.quotes.filter((quote) => quote.price != null).length;
}

function quotePrice(overview: CommodityOverview, id: string): number | null {
  const hit = overview.quotes.find((quote) => quote.id === id);
  return hit?.price ?? null;
}

function usable(overview: CommodityOverview | null | undefined): overview is CommodityOverview {
  return !!overview?.quotes?.length && priceCount(overview) >= MIN_PRICED_QUOTES;
}

/** Only cache snapshots that include live Avanza Last for the five unified instruments. */
function cacheWorthy(overview: CommodityOverview | null | undefined): overview is CommodityOverview {
  if (!usable(overview)) return false;
  return REQUIRED_AVANZA_IDS.every((id) => quotePrice(overview, id) != null);
}

/** Keep prior Avanza Last if a transient feed miss would blank the desk. Never invent Yahoo prices. */
function mergeAvanzaQuotes(
  live: CommodityOverview,
  prior: CommodityOverview | null,
): CommodityOverview {
  if (!prior?.quotes?.length) return live;
  const priorById = new Map(prior.quotes.map((quote) => [quote.id, quote]));
  const required = new Set<string>(REQUIRED_AVANZA_IDS);
  let changed = false;
  const quotes: CommodityQuote[] = live.quotes.map((quote) => {
    if (!required.has(quote.id)) return quote;
    if (quote.price != null) return quote;
    const prev = priorById.get(quote.id);
    if (prev?.price == null || prev.sourceLabel !== "Avanza") return quote;
    changed = true;
    return { ...prev };
  });
  return changed ? { ...live, quotes } : live;
}

function readDisk(): CommodityOverview | null {
  try {
    if (!existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf8")) as DiskCacheFile;
    if (raw?.version !== CACHE_VERSION || !cacheWorthy(raw.payload)) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeDisk(payload: CommodityOverview): void {
  try {
    const dir = dirname(DISK_CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      payload,
    };
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(file));
  } catch {
    // A failed cache write still leaves the live payload usable.
  }
}

async function loadCached(): Promise<CommodityOverview> {
  const fresh =
    cacheWorthy(memory.payload) && Date.now() - memory.savedAt < CACHE_MS ? memory.payload : null;
  if (fresh) return fresh;
  if (inflight) return inflight;

  inflight = (async () => {
    const prior = cacheWorthy(memory.payload) ? memory.payload : readDisk();
    try {
      const live = await loadCommodityOverview();
      const overview = mergeAvanzaQuotes(live, prior);
      if (cacheWorthy(overview)) {
        memory.savedAt = Date.now();
        memory.payload = overview;
        writeDisk(overview);
        return overview;
      }
      if (usable(overview)) return overview;
      if (cacheWorthy(prior)) return { ...prior, fromStaleCache: true };
      return overview;
    } catch (err) {
      if (cacheWorthy(prior)) return { ...prior, fromStaleCache: true };
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const getCommodityOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommodityOverview> => loadCached(),
);
