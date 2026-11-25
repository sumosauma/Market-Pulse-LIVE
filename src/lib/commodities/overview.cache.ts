import { loadCommodityOverview } from "./overview.server";
import type { CommodityOverview, CommodityQuote } from "./overview";
import { createSwrCache } from "./swrCache";

const DISK_CACHE_PATH = "data/cache/commodities-overview.json";
const CACHE_MS = 15 * 60 * 1000;
/** Bumped after Avanza unified Last/1D%/history for Brent, WTI, Nat Gas, Gold, Silver. */
const CACHE_VERSION = 10;
/** Don't treat a mostly-empty overview as a successful cache hit. */
const MIN_PRICED_QUOTES = 6;
/** Price History panel instruments that must not be cached without a live Avanza Last. */
const REQUIRED_AVANZA_IDS = ["brent", "wti", "henry-hub", "gold", "silver"] as const;

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

const cache = createSwrCache<CommodityOverview>({
  cacheMs: CACHE_MS,
  version: CACHE_VERSION,
  diskPath: DISK_CACHE_PATH,
  usable,
  cacheWorthy,
  loadLive: loadCommodityOverview,
  mergeLive: mergeAvanzaQuotes,
  markStale: (payload) => ({ ...payload, fromStaleCache: true }),
});

export function getCachedCommodityOverview(): Promise<CommodityOverview> {
  return cache.load();
}
