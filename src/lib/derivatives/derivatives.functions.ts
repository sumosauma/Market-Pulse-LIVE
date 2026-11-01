import { createServerFn } from "@tanstack/react-start";
import { readAnyVolCache, readFreshVolCache, writeVolCache } from "./cache";
import { fetchCboeSpxIv20 } from "./cboeSpxOptions";
import { fetchFredDailyCloses, fetchYahooDailyCloses } from "./dailyCloses";
import { iv20FromListedOptions } from "./listedOptionsIv";
import { DERIVATIVES_MARKETS, type DerivativesMarketDef } from "./markets";
import { fetchNasdaqOmxs30OptionQuotes } from "./nasdaqNordicOptions";
import { fetchNordnetOmxs30OptionQuotes } from "./nordnetOmxs30Options";
import { VIX_CBOE_HISTORY_URL } from "./vixEodPercentile";
import { fetchOfficialText } from "./officialFetch";
import { parseCboeVolHistory, parseStoxxVolHistory } from "./volTermStructure";
import { VSTOXX_STOXX_EOD_URL, VSTOXX_SYMBOL } from "./vstoxxQuote";
import {
  computeRv20,
  computeVrp,
  rollingRv20Series,
  rv20Percentile1y,
  vrpHistoryFromImpliedAndRv,
  vrpPercentile1y,
  type Rv20Point,
} from "./realizedVol";
import type { Iv20Result } from "./impliedVol";
import {
  fetchTradingViewOptionsChain,
  fetchTradingViewUnderlyingSpot,
} from "./tradingviewOptions";
import type { MarketVolatilityPayload, MarketVolRow, VolMetric } from "./types";

export const DERIVATIVES_VOL_QUERY_KEY = ["derivatives-vol", "v9"] as const;

let inflight: Promise<MarketVolatilityPayload> | null = null;

function emptyMetric(reason: string | null): VolMetric {
  return { value: null, asOf: null, sourceLabel: null, unavailableReason: reason };
}

function metric(value: number, asOf: string | null, sourceLabel: string): VolMetric {
  return { value, asOf, sourceLabel, unavailableReason: null };
}

async function loadDailyCloses(market: DerivativesMarketDef) {
  try {
    const points = await fetchYahooDailyCloses(market.yahooTicker);
    return { points, sourceLabel: `Yahoo ${market.yahooTicker}` };
  } catch (yahooErr) {
    if (!market.fredFallbackId) throw yahooErr;
    const points = await fetchFredDailyCloses(market.fredFallbackId);
    return { points, sourceLabel: `FRED ${market.fredFallbackId}` };
  }
}

async function loadRv20(market: DerivativesMarketDef): Promise<{ metric: VolMetric; series: Rv20Point[] }> {
  try {
    const loaded = await loadDailyCloses(market);
    const rv = computeRv20(loaded.points);
    if (!rv) {
      return { metric: emptyMetric("Need 21 daily closes for 20-day realized volatility"), series: [] };
    }
    const series = rollingRv20Series(loaded.points);
    const ranked = rv20Percentile1y(series);
    return {
      metric: {
        ...metric(rv.rv20, rv.asOf, loaded.sourceLabel),
        percentile1y: ranked?.percentile ?? null,
        percentileObservationCount: ranked?.observationCount ?? 0,
      },
      series,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { metric: emptyMetric(msg.slice(0, 160)), series: [] };
  }
}

function iv20SourceLabel(prefix: string, iv: Iv20Result): string {
  const strikes = [...new Set((iv.legs ?? []).map((leg) => leg.atmStrike))];
  const strike =
    strikes.length > 0
      ? ` ATM ${strikes.join("/")}`
      : iv.atmStrike != null
        ? ` ATM ${iv.atmStrike}`
        : "";
  const tenor = iv.method === "exact" ? iv.expiry : `interpolated ${iv.expiry}`;
  const root = iv.legs?.[0]?.call.root ?? iv.call?.root ?? iv.put?.root ?? "";
  return `${prefix}${root ? ` ${root}` : ""}${strike} · ${tenor}`;
}

async function loadTvListedIv20(
  underlyings: readonly string[],
  preferRoot: string | undefined,
  prefix: string,
  emptyReason: string,
): Promise<VolMetric> {
  const asOf = new Date().toISOString().slice(0, 10);
  for (const underlying of underlyings) {
    try {
      const spot = await fetchTradingViewUnderlyingSpot(underlying);
      const chain = await fetchTradingViewOptionsChain(underlying, asOf, { spot });
      const iv = iv20FromListedOptions(chain, spot, asOf, preferRoot);
      if (!iv) continue;
      const legTxt = (iv.legs ?? [])
        .map(
          (leg) =>
            `${leg.expiry} ATM ${leg.atmStrike} ${leg.call.symbol} ${leg.call.ivPct.toFixed(2)} / ${leg.put.symbol} ${leg.put.ivPct.toFixed(2)}`,
        )
        .join(" | ");
      console.log(
        `[IV20] ${underlying} iv20=${iv.iv20.toFixed(2)} method=${iv.method} expiry=${iv.expiry}` +
          ` spot=${spot}` +
          (legTxt ? ` | ${legTxt}` : ""),
      );
      return metric(iv.iv20, iv.asOf, iv20SourceLabel(prefix, iv));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[IV20] ${underlying} failed: ${msg}`);
    }
  }
  return emptyMetric(emptyReason);
}

async function omxs30Spot(): Promise<number> {
  try {
    return await fetchTradingViewUnderlyingSpot("OMXSTO:OMXS30");
  } catch {
    const points = await fetchYahooDailyCloses("^OMX");
    const last = points[points.length - 1]?.close;
    if (!(last != null && last > 0)) throw new Error("OMXS30 spot missing");
    return last;
  }
}

async function loadOmxIv20(emptyReason: string): Promise<VolMetric> {
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    const spot = await omxs30Spot();
    const errors: string[] = [];
    const loaders = [
      () => fetchNasdaqOmxs30OptionQuotes(asOf, spot),
      () => fetchNordnetOmxs30OptionQuotes(asOf, spot),
    ];
    for (const load of loaders) {
      try {
        const chain = await load();
        const iv = iv20FromListedOptions(chain.quotes, spot, chain.asOf);
        if (!iv) {
          errors.push(`${chain.sourceLabel}: no 20D ATM pair`);
          continue;
        }
        const legTxt = (iv.legs ?? [])
          .map(
            (leg) =>
              `${leg.expiry} ATM ${leg.atmStrike} ${leg.call.symbol} ${leg.call.ivPct.toFixed(2)} / ${leg.put.symbol} ${leg.put.ivPct.toFixed(2)}`,
          )
          .join(" | ");
        console.log(
          `[IV20] OMXS30 ${chain.sourceLabel} iv20=${iv.iv20.toFixed(2)} method=${iv.method} expiry=${iv.expiry}` +
            ` spot=${spot} asOf=${chain.asOf}` +
            (legTxt ? ` | ${legTxt}` : ""),
        );
        return metric(iv.iv20, iv.asOf, iv20SourceLabel(chain.sourceLabel, iv));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[IV20] OMXS30 source failed: ${msg}`);
        errors.push(msg);
      }
    }
    if (errors.length) return emptyMetric(errors[errors.length - 1]!.slice(0, 160));
    return emptyMetric(emptyReason);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[IV20] OMXS30 failed: ${msg}`);
    return emptyMetric(emptyReason);
  }
}

async function loadIv20(market: DerivativesMarketDef): Promise<VolMetric> {
  try {
    if (market.id === "spx") {
      const iv = await fetchCboeSpxIv20();
      const tenor = iv.method === "exact" ? iv.expiry : `interpolated ${iv.expiry}`;
      return metric(iv.iv20, iv.asOf, `CBOE delayed SPX options · ATM · ${tenor}`);
    }
    if (market.id === "sx5e") {
      return loadTvListedIv20(
        ["STOXX:SX5E"],
        "OESX",
        "TradingView Eurex",
        "No 20D ATM IV on Eurex OESX/OEXP chain",
      );
    }
    if (market.id === "omxs30") {
      return loadOmxIv20(market.ivUnavailableReason ?? "OMXS30 options chain unavailable");
    }
    return emptyMetric(market.ivUnavailableReason);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyMetric(msg.slice(0, 160));
  }
}

async function loadVrpImpliedHistory(
  market: DerivativesMarketDef,
): Promise<{ date: string; close: number }[]> {
  try {
    if (market.id === "spx") {
      const text = await fetchOfficialText(VIX_CBOE_HISTORY_URL, "text/csv,*/*", "https://www.cboe.com/");
      return text ? parseCboeVolHistory(text) : [];
    }
    if (market.id === "sx5e") {
      const text = await fetchOfficialText(
        VSTOXX_STOXX_EOD_URL,
        "text/plain,text/csv,*/*",
        "https://www.stoxx.com/",
      );
      return text ? parseStoxxVolHistory(text, VSTOXX_SYMBOL) : [];
    }
    return [];
  } catch {
    return [];
  }
}

async function loadMarket(market: DerivativesMarketDef): Promise<MarketVolRow> {
  const [rvPack, iv20, impliedHistory] = await Promise.all([
    loadRv20(market),
    loadIv20(market),
    loadVrpImpliedHistory(market),
  ]);
  const rv20 = rvPack.metric;
  const vrpValue = computeVrp(iv20.value, rv20.value);
  const ranked = vrpPercentile1y(vrpHistoryFromImpliedAndRv(impliedHistory, rvPack.series));
  const vrp: VolMetric =
    vrpValue == null
      ? {
          ...emptyMetric(iv20.value == null ? "Needs 20-day implied volatility" : (rv20.unavailableReason ?? "Needs 20-day realized volatility")),
          percentile1y: ranked?.percentile ?? null,
          percentileObservationCount: ranked?.observationCount ?? 0,
        }
      : {
          ...metric(vrpValue, iv20.asOf ?? rv20.asOf ?? null, "implied minus realized"),
          percentile1y: ranked?.percentile ?? null,
          percentileObservationCount: ranked?.observationCount ?? 0,
        };

  return {
    id: market.id,
    label: market.label,
    countryId: market.countryId,
    rv20,
    iv20,
    vrp,
  };
}

async function loadMarketVolatility(): Promise<MarketVolatilityPayload> {
  const fresh = readFreshVolCache();
  if (fresh) return fresh;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rows = await Promise.all(DERIVATIVES_MARKETS.map((m) => loadMarket(m)));
      const payload: MarketVolatilityPayload = {
        rows,
        fetchedAt: new Date().toISOString(),
        fromCache: false,
      };
      writeVolCache(payload);
      return payload;
    } catch (err) {
      const stale = readAnyVolCache();
      if (stale) return { ...stale, fromCache: true };
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const getMarketVolatility = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketVolatilityPayload> => loadMarketVolatility(),
);
