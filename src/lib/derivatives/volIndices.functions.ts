import { createServerFn } from "@tanstack/react-start";
import { isIndexQuote, type TvSymbolQuote } from "./tradingviewQuote";
import { fetchTradingViewSymbol } from "./tradingviewScanner";
import { buildEquityVolDayMove, buildSpxVixDayMove } from "./vixSpxDayMove";
import {
  VOL_INDICES,
  type VolIndexDef,
  type VolIndexRow,
  type VolIndicesPayload,
} from "./volIndices";
import { readFreshVolIndicesCache, writeVolIndicesCache } from "./volIndicesCache";
import { loadSkewIndex } from "./skewSource";
import { loadVstoxxIndex } from "./vstoxxSource";
import { vstoxxPriorSessionClose, type VstoxxResolved } from "./vstoxxQuote";
import { loadVixEodPercentile } from "./vixEodPercentile";
import { loadVvixIndex } from "./vvixSource";

export const VOL_INDICES_QUERY_KEY = ["derivatives-vol-indices", "vstoxx-stoxx-mi", "v9"] as const;

const SPX_TV_TICKERS = ["SP:SPX", "CBOE:SPX"] as const;
const SX5E_TV_TICKERS = ["STOXX:SX5E", "TVC:SX5E"] as const;

let inflight: Promise<VolIndicesPayload> | null = null;

function emptyRow(def: VolIndexDef, reason: string): VolIndexRow {
  return {
    id: def.id,
    label: def.label,
    countryId: def.countryId,
    hint: def.hint,
    ticker: null,
    last: null,
    changePct: null,
    asOf: null,
    sourceLabel: null,
    unavailableReason: reason,
    percentile1y: null,
    percentileAsOf: null,
    percentileObservationCount: 0,
  };
}

type LoadedVolIndex = {
  row: VolIndexRow;
  quote: TvSymbolQuote | null;
  vstoxx: VstoxxResolved | null;
};

async function loadVolIndexRow(def: VolIndexDef, fetchedAt: string): Promise<LoadedVolIndex> {
  if (def.id === "vstoxx") {
    const { row, resolved } = await loadVstoxxIndex(def, fetchedAt);
    return { row, quote: null, vstoxx: resolved };
  }
  if (def.id === "vvix") {
    const row = await loadVvixIndex(def);
    return { row, quote: null, vstoxx: null };
  }
  for (const ticker of def.tvTickers) {
    const quote = await fetchTradingViewSymbol(ticker);
    if (!quote || quote.close == null) continue;
    if (!isIndexQuote(quote)) continue;
    return {
      row: {
        id: def.id,
        label: def.label,
        countryId: def.countryId,
        hint: def.hint,
        ticker,
        last: quote.close,
        changePct: quote.changePct,
        asOf: fetchedAt,
        sourceLabel: `TradingView ${ticker}`,
        unavailableReason: null,
        percentile1y: null,
        percentileAsOf: null,
        percentileObservationCount: 0,
      },
      quote,
      vstoxx: null,
    };
  }
  return { row: emptyRow(def, def.missingReason), quote: null, vstoxx: null };
}

async function loadIndexQuote(tickers: readonly string[]): Promise<TvSymbolQuote | null> {
  for (const ticker of tickers) {
    const quote = await fetchTradingViewSymbol(ticker);
    if (!quote || quote.close == null) continue;
    if (!isIndexQuote(quote)) continue;
    return quote;
  }
  return null;
}

function berlinDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

async function loadVolIndices(): Promise<VolIndicesPayload> {
  const fresh = readFreshVolIndicesCache();
  if (fresh) return fresh;
  if (inflight) return inflight;

  inflight = (async () => {
    const fetchedAt = new Date().toISOString();
    try {
      const [loaded, spxQuote, sx5eQuote, skew, vixEod] = await Promise.all([
        Promise.all(VOL_INDICES.map((def) => loadVolIndexRow(def, fetchedAt))),
        loadIndexQuote(SPX_TV_TICKERS),
        loadIndexQuote(SX5E_TV_TICKERS),
        loadSkewIndex(),
        loadVixEodPercentile(),
      ]);
      const rows = loaded.map((item) => {
        if (item.row.id !== "vix") return item.row;
        return {
          ...item.row,
          percentile1y: vixEod.percentile1y,
          percentileAsOf: vixEod.percentileAsOf,
          percentileObservationCount: vixEod.percentileObservationCount,
        };
      });
      const vixLoaded = loaded.find((item) => item.row.id === "vix");
      const vixQuote =
        vixLoaded && !vixLoaded.row.unavailableReason && vixLoaded.quote && isIndexQuote(vixLoaded.quote)
          ? vixLoaded.quote
          : null;
      const spxVixDayMove =
        vixQuote && spxQuote ? buildSpxVixDayMove(vixQuote, spxQuote) : null;

      const vstoxxLoaded = loaded.find((item) => item.row.id === "vstoxx");
      const vstoxxResolved =
        vstoxxLoaded && !vstoxxLoaded.row.unavailableReason && vstoxxLoaded.vstoxx
          ? vstoxxLoaded.vstoxx
          : null;
      const sx5eVstoxxDayMove =
        vstoxxResolved && sx5eQuote && sx5eQuote.close != null && sx5eQuote.prevClose != null
          ? buildEquityVolDayMove({
              volLast: vstoxxResolved.last,
              volPrevClose: vstoxxPriorSessionClose(vstoxxResolved, berlinDay(fetchedAt)),
              equityLast: sx5eQuote.close,
              equityPrevClose: sx5eQuote.prevClose,
              equitySourceLabel: `TradingView ${sx5eQuote.symbol}`,
              volSourceLabel: vstoxxLoaded?.row.sourceLabel ?? "VSTOXX",
            })
          : null;

      const payload: VolIndicesPayload = {
        rows,
        fetchedAt,
        fromCache: false,
        spxVixDayMove,
        sx5eVstoxxDayMove,
        skew,
      };
      const percentilesReady = rows.every(
        (row) => row.last == null || (typeof row.percentile1y === "number" && Number.isFinite(row.percentile1y)),
      );
      if (percentilesReady) writeVolIndicesCache(payload);
      return payload;
    } catch {
      return {
        rows: VOL_INDICES.map((def) => emptyRow(def, def.missingReason)),
        fetchedAt,
        fromCache: false,
        spxVixDayMove: null,
        sx5eVstoxxDayMove: null,
        skew: null,
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const getVolIndices = createServerFn({ method: "GET" }).handler(
  async (): Promise<VolIndicesPayload> => loadVolIndices(),
);
