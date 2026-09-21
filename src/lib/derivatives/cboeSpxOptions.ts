import { iv20FromCboeChain, type CboeOptionRow, type Iv20Result } from "./impliedVol";

const CBOE_SPX_OPTIONS_URL = "https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json";
const FETCH_TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

type CboeChainJson = {
  timestamp?: string;
  data?: {
    current_price?: number;
    options?: CboeOptionRow[];
  };
};

function asOfDateFromTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return new Date().toISOString().slice(0, 10);
  const date = timestamp.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
}

export async function fetchCboeSpxIv20(): Promise<Iv20Result> {
  const res = await fetch(CBOE_SPX_OPTIONS_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CBOE HTTP ${res.status}`);
  const json = (await res.json()) as CboeChainJson;
  const spot = json.data?.current_price;
  const options = json.data?.options;
  if (typeof spot !== "number" || !Number.isFinite(spot) || !Array.isArray(options) || options.length === 0) {
    throw new Error("CBOE SPX chain missing spot or options");
  }
  const asOf = asOfDateFromTimestamp(json.timestamp);
  const iv = iv20FromCboeChain(options, spot, asOf);
  if (!iv) throw new Error("CBOE SPX chain had no usable 20-day ATM implied vol");
  return iv;
}
