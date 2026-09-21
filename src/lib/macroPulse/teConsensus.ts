import {
  formatIndexDelta,
  formatKDelta,
  formatPpDelta,
  type MacroChangeDirection,
} from "./format";
import {
  formatObservationLabel,
  formatTeConsensusDisplay,
  parseTeNumeric,
  pickReleasedTeRow,
  pickUpcomingTeRow,
  seriesRowsFor,
  TE_SERIES,
  TE_SOURCE_URL,
  type TeCalendarRow,
  upcomingObservationMonth,
} from "./teCalendar";
import { monthKey } from "./freshness";
import type { MacroPulseDisplayKind, MacroPulseIndicatorId } from "./types";

export type ConsensusSnapshot = Readonly<{
  forecast: number | null;
  forecastDisplay: string | null;
  nextReleaseConsensusDisplay: string | null;
  revisionDisplay: string | null;
  revisionDirection: MacroChangeDirection | null;
  releaseDateIso: string | null;
  observationMonth: string | null;
  sourceUrl: string;
}>;

/** Consensus column = latest released event; Next Release = upcoming event. */
export function usesLatestReleaseConsensus(_indicatorId: MacroPulseIndicatorId): boolean {
  return true;
}

export function emptyConsensus(indicatorId: MacroPulseIndicatorId): ConsensusSnapshot {
  return {
    forecast: null,
    forecastDisplay: null,
    nextReleaseConsensusDisplay: null,
    revisionDisplay: null,
    revisionDirection: null,
    releaseDateIso: null,
    observationMonth: null,
    sourceUrl: TE_SOURCE_URL[indicatorId],
  };
}

export function formatConsensusRevision(
  current: number,
  previous: number,
  displayKind: MacroPulseDisplayKind,
): { value: string; direction: MacroChangeDirection } {
  const delta = current - previous;
  if (displayKind === "change_thousands") {
    const fmt = formatKDelta(delta);
    const mag = Math.abs(Math.round(delta));
    const arrow = fmt.direction === "up" ? "↑ " : fmt.direction === "down" ? "↓ " : "";
    return { value: `${arrow}${mag}k`, direction: fmt.direction };
  }
  if (displayKind === "index_pts") {
    const fmt = formatIndexDelta(delta);
    const mag = Math.abs(delta).toFixed(1);
    const arrow = fmt.direction === "up" ? "↑ " : fmt.direction === "down" ? "↓ " : "";
    return { value: `${arrow}${mag}`, direction: fmt.direction };
  }
  const fmt = formatPpDelta(delta);
  const mag = Math.abs(delta).toFixed(1);
  const arrow = fmt.direction === "up" ? "↑ " : fmt.direction === "down" ? "↓ " : "";
  return { value: `${arrow}${mag} pp`, direction: fmt.direction };
}

export function revisionFromHistory(
  current: number,
  previous: number | null,
  displayKind: MacroPulseDisplayKind,
): { value: string; direction: MacroChangeDirection } | null {
  if (previous === null) return null;
  return formatConsensusRevision(current, previous, displayKind);
}

function displayOrNull(
  raw: string,
  displayKind: MacroPulseDisplayKind,
): { value: number; display: string } | null {
  const value = parseTeNumeric(raw);
  if (value === null) return null;
  return { value, display: formatTeConsensusDisplay(value, displayKind) };
}

async function consensusForLatestRelease(
  indicatorId: MacroPulseIndicatorId,
  displayKind: MacroPulseDisplayKind,
  latestObservationDate: string,
  rows: readonly TeCalendarRow[],
): Promise<ConsensusSnapshot> {
  const spec = TE_SERIES[indicatorId];
  const latestYm = monthKey(latestObservationDate);
  const upcomingYm = upcomingObservationMonth(latestObservationDate);
  const released = pickReleasedTeRow(rows, spec, latestYm);
  const upcoming = pickUpcomingTeRow(rows, spec, upcomingYm);
  const latest = released ? displayOrNull(released.consensus, displayKind) : null;
  const next = upcoming ? displayOrNull(upcoming.consensus, displayKind) : null;
  return {
    forecast: latest?.value ?? null,
    forecastDisplay: latest?.display ?? null,
    nextReleaseConsensusDisplay: next?.display ?? null,
    revisionDisplay: null,
    revisionDirection: null,
    releaseDateIso: released?.releaseDateIso ?? upcoming?.releaseDateIso ?? null,
    observationMonth: latestYm,
    sourceUrl: TE_SOURCE_URL[indicatorId],
  };
}

export async function consensusFromCalendarRows(
  indicatorId: MacroPulseIndicatorId,
  displayKind: MacroPulseDisplayKind,
  latestObservationDate: string,
  rows: readonly TeCalendarRow[],
  _now = new Date(),
): Promise<ConsensusSnapshot> {
  return consensusForLatestRelease(indicatorId, displayKind, latestObservationDate, rows);
}

export type TeConsensusDiagnostic = Readonly<{
  indicatorId: MacroPulseIndicatorId;
  url: string;
  upcomingObservation: string;
  upcomingYm: string;
  releaseDate: string;
  event: string;
  actual: string;
  previous: string;
  consensus: string;
  teForecast: string;
  selectedField: "Consensus";
  parserResult: string | null;
  reason: string;
  rawEvent: TeCalendarRow | null;
  seriesRows: readonly TeCalendarRow[];
}>;

function dash(value: string): string {
  return value.trim() ? value : "—";
}

export function diagnoseConsensusPick(
  indicatorId: MacroPulseIndicatorId,
  displayKind: MacroPulseDisplayKind,
  latestObservationDate: string,
  rows: readonly TeCalendarRow[],
): TeConsensusDiagnostic {
  const spec = TE_SERIES[indicatorId];
  const upcomingYm = upcomingObservationMonth(latestObservationDate);
  const seriesRows = seriesRowsFor(rows, spec);
  const picked = pickUpcomingTeRow(rows, spec, upcomingYm);
  const selectedField = "Consensus" as const;

  if (!picked) {
    return {
      indicatorId,
      url: TE_SOURCE_URL[indicatorId],
      upcomingObservation: formatObservationLabel(upcomingYm),
      upcomingYm,
      releaseDate: "—",
      event: "—",
      actual: "—",
      previous: "—",
      consensus: "—",
      teForecast: "—",
      selectedField,
      parserResult: null,
      reason: `No unreleased Trading Economics event matched ${formatObservationLabel(upcomingYm)}. ${seriesRows.length} series row(s) were scraped.`,
      rawEvent: null,
      seriesRows,
    };
  }

  const consensusNumber = parseTeNumeric(picked.consensus);
  const forecastNumber = parseTeNumeric(picked.teForecast);
  let reason: string;
  if (consensusNumber !== null) {
    reason =
      forecastNumber !== null && forecastNumber !== consensusNumber
        ? `Selected Consensus (${picked.consensus}), not TEForecast (${picked.teForecast}).`
        : `Selected Consensus (${picked.consensus}).`;
  } else if (picked.teForecast.trim()) {
    reason = `Upcoming event found but Consensus cell is empty. TEForecast ${picked.teForecast} was not used.`;
  } else {
    reason = "Upcoming event found but both Consensus and TEForecast cells are empty.";
  }

  return {
    indicatorId,
    url: TE_SOURCE_URL[indicatorId],
    upcomingObservation: formatObservationLabel(upcomingYm),
    upcomingYm,
    releaseDate: picked.releaseDateIso || "—",
    event: picked.event || "—",
    actual: dash(picked.actual),
    previous: dash(picked.previous),
    consensus: dash(picked.consensus),
    teForecast: dash(picked.teForecast),
    selectedField,
    parserResult:
      consensusNumber === null ? null : formatTeConsensusDisplay(consensusNumber, displayKind),
    reason,
    rawEvent: picked,
    seriesRows,
  };
}
