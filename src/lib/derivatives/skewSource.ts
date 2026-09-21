import {
  parseCboeSkewHistory,
  resolveSkewIndex,
  SKEW_CBOE_HISTORY_URL,
  type SkewIndexRow,
} from "./skewIndex";

const FETCH_TIMEOUT_MS = 15_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function loadSkewIndex(): Promise<SkewIndexRow> {
  try {
    const res = await fetch(SKEW_CBOE_HISTORY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/csv,*/*",
        "User-Agent": UA,
        Referer: "https://www.cboe.com/",
      },
      redirect: "follow",
    });
    if (!res.ok) return emptySkew("CBOE SKEW history unavailable");
    const text = await res.text();
    const resolved = resolveSkewIndex(parseCboeSkewHistory(text));
    return resolved ?? emptySkew("CBOE SKEW history unavailable");
  } catch {
    return emptySkew("CBOE SKEW history unavailable");
  }
}

function emptySkew(reason: string): SkewIndexRow {
  return {
    last: null,
    changePct: null,
    percentile1y: null,
    tailRisk: null,
    observationCount: 0,
    asOf: null,
    sourceLabel: null,
    unavailableReason: reason,
  };
}
