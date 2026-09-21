import type { VolIndexDef, VolIndexRow } from "./volIndices";
import { ensureNodeSystemCa, fetchOfficialText } from "./officialFetch";
import {
  PERCENTILE_LOOKBACK_SESSIONS,
  PERCENTILE_MIN_OBSERVATIONS,
  percentileFromDatedCloses,
} from "./percentile";
import {
  latestTwoV2txCloses,
  parseMarketsInsiderVstoxxHtml,
  parseStoxxV2txHistory,
  resolveVstoxxQuote,
  VSTOXX_MARKETS_INSIDER_URL,
  VSTOXX_STOXX_EOD_URL,
  VSTOXX_SYMBOL,
  type VstoxxResolved,
} from "./vstoxxQuote";

export type VstoxxLoadDebug = {
  last: number | null;
  officialPrevClose: number | null;
  changePct: number | null;
  lastSource: string | null;
  prevCloseSource: string | null;
  kind: VstoxxResolved["kind"] | "unavailable";
  prevCloseCrossCheck: VstoxxResolved["prevCloseCrossCheck"] | "unavailable";
};

export async function loadVstoxxIndexRow(def: VolIndexDef, fetchedAt: string): Promise<VolIndexRow> {
  const { row } = await loadVstoxxIndex(def, fetchedAt);
  return row;
}

export async function loadVstoxxIndex(
  def: VolIndexDef,
  fetchedAt: string,
): Promise<{ row: VolIndexRow; debug: VstoxxLoadDebug; resolved: VstoxxResolved | null }> {
  await ensureNodeSystemCa();
  const [eodText, miHtml] = await Promise.all([
    fetchOfficialText(VSTOXX_STOXX_EOD_URL, "text/plain,text/csv,*/*", "https://www.stoxx.com/"),
    fetchOfficialText(
      VSTOXX_MARKETS_INSIDER_URL,
      "text/html,application/xhtml+xml",
      "https://markets.businessinsider.com/",
    ),
  ]);
  const history = eodText ? parseStoxxV2txHistory(eodText) : [];
  const eodPair = history.length > 0 ? latestTwoV2txCloses(history) : null;
  const ranked = percentileFromDatedCloses(
    history,
    PERCENTILE_LOOKBACK_SESSIONS,
    PERCENTILE_MIN_OBSERVATIONS,
  );
  const percentile = {
    percentile1y: ranked?.percentile ?? null,
    percentileAsOf: ranked?.asOf ?? null,
    percentileObservationCount: ranked?.observationCount ?? 0,
  };
  const intraday = miHtml ? parseMarketsInsiderVstoxxHtml(miHtml) : null;
  const resolved = resolveVstoxxQuote(eodPair, intraday);
  if (!resolved) {
    return {
      row: { ...emptyVstoxxRow(def), ...percentile },
      resolved: null,
      debug: {
        last: null,
        officialPrevClose: null,
        changePct: null,
        lastSource: null,
        prevCloseSource: null,
        kind: "unavailable",
        prevCloseCrossCheck: "unavailable",
      },
    };
  }
  return {
    row: {
      id: def.id,
      label: def.label,
      countryId: def.countryId,
      hint: def.hint,
      ticker: VSTOXX_SYMBOL,
      last: resolved.last,
      changePct: resolved.changePct,
      asOf: fetchedAt,
      sourceLabel: resolved.lastSource,
      unavailableReason: null,
      ...percentile,
    },
    resolved,
    debug: {
      last: resolved.last,
      officialPrevClose: resolved.prevClose,
      changePct: resolved.changePct,
      lastSource: resolved.lastSource,
      prevCloseSource: resolved.prevCloseSource,
      kind: resolved.kind,
      prevCloseCrossCheck: resolved.prevCloseCrossCheck,
    },
  };
}

function emptyVstoxxRow(def: VolIndexDef): VolIndexRow {
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
    unavailableReason: def.missingReason,
    percentile1y: null,
    percentileAsOf: null,
    percentileObservationCount: 0,
  };
}
