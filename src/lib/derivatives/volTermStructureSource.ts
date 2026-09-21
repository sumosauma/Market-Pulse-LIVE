import {
  parseVolTermSeriesText,
  resolveVolTermStructure,
  VOL_TERM_SERIES,
  type VolTermSeriesHistory,
  type VolTermStructurePayload,
} from "./volTermStructure";
import { readFreshVolTermCache, writeVolTermCache } from "./volTermStructureCache";
import { ensureNodeSystemCa, fetchOfficialText } from "./officialFetch";

let inflight: Promise<VolTermStructurePayload> | null = null;

export async function loadVolTermStructure(): Promise<VolTermStructurePayload> {
  const fresh = readFreshVolTermCache();
  if (fresh) return fresh;
  if (inflight) return inflight;

  inflight = (async () => {
    const fetchedAt = new Date().toISOString();
    try {
      await ensureNodeSystemCa();
      const histories = await Promise.all(VOL_TERM_SERIES.map((def) => fetchSeries(def)));
      const resolved = resolveVolTermStructure(histories);
      const payload: VolTermStructurePayload = { ...resolved, fetchedAt, fromCache: false };
      if (!payload.unavailableReason) writeVolTermCache(payload);
      return payload;
    } catch {
      return {
        asOf: null,
        fetchedAt,
        fromCache: false,
        chartRows: null,
        spx: null,
        sx5e: null,
        spxSpread1m3m: null,
        spxSpread1m1y: null,
        sx5eSpread1m3m: null,
        sx5eSpread1m1y: null,
        unavailableReason: "Could not load official volatility term-structure files.",
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function fetchSeries(
  def: (typeof VOL_TERM_SERIES)[number],
): Promise<VolTermSeriesHistory> {
  const accept = def.sourceKind === "cboe-csv" ? "text/csv,*/*" : "text/plain,text/csv,*/*";
  const referer = def.sourceKind === "cboe-csv" ? "https://www.cboe.com/" : "https://www.stoxx.com/";
  const text = await fetchOfficialText(def.sourceUrl, accept, referer);
  return {
    def,
    rows: text ? parseVolTermSeriesText(def, text) : [],
  };
}
