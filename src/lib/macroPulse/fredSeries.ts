import { addMonths, monthKey } from "./freshness";
import {
  CHANGE_LABEL_FROM_PREVIOUS,
  formatKDelta,
  formatMoMSecondary,
  formatPct,
  formatPpDelta,
  formatThousandsChange,
  formatYoYHeadline,
  type MacroChangeDirection,
} from "./format";

export type FredObs = { date: string; value: number };

export type FredRowSnapshot = Readonly<{
  headlineValue: string;
  headlineYoY?: number | null;
  changeVsPriorDisplay: string | null;
  changeSecondaryValue: string | null;
  changeVsPriorDirection: MacroChangeDirection | null;
  secondaryValue: string | null;
  observationDate: string;
}>;

/** Drop the current incomplete month and any future months (never use an unreleased print). */
export function filterReleasedFredObservations(observations: FredObs[], now: Date): FredObs[] {
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return observations.filter((o) => monthKey(o.date) < currentYm);
}

function yoyForMonth(byMonth: Map<string, number>, ym: string): number | null {
  const yoyMonth = addMonths(ym, -12);
  if (!byMonth.has(ym) || !byMonth.has(yoyMonth)) return null;
  return (byMonth.get(ym)! / byMonth.get(yoyMonth)! - 1) * 100;
}

export function computeIndexYoYMoM(observations: FredObs[]): FredRowSnapshot {
  const byMonth = new Map(observations.map((o) => [monthKey(o.date), o.value]));
  const sorted = [...byMonth.keys()].sort();
  const latestMonth = sorted.at(-1);
  if (!latestMonth) throw new Error("No monthly observations");

  const prevMonth = addMonths(latestMonth, -1);
  const latestYoy = yoyForMonth(byMonth, latestMonth);
  const priorYoy = yoyForMonth(byMonth, prevMonth);
  if (latestYoy === null) throw new Error("Insufficient history for YoY");

  const mom =
    byMonth.has(prevMonth) ? ((byMonth.get(latestMonth)! / byMonth.get(prevMonth)! - 1) * 100) : null;

  const yoyDelta = priorYoy !== null ? latestYoy - priorYoy : null;
  const change = yoyDelta !== null ? formatPpDelta(yoyDelta) : null;

  return {
    headlineValue: formatYoYHeadline(latestYoy),
    headlineYoY: latestYoy,
    changeVsPriorDisplay: change?.value ?? null,
    changeSecondaryValue: change ? CHANGE_LABEL_FROM_PREVIOUS : null,
    changeVsPriorDirection: change?.direction ?? null,
    secondaryValue: mom !== null ? formatMoMSecondary(mom) : null,
    observationDate: `${latestMonth}-01`,
  };
}

export function computePayemsChange(observations: FredObs[]): FredRowSnapshot {
  const byMonth = new Map(observations.map((o) => [monthKey(o.date), o.value]));
  const sorted = [...byMonth.keys()].sort();
  const latestMonth = sorted.at(-1);
  const prevMonth = latestMonth ? addMonths(latestMonth, -1) : null;
  const prevPrevMonth = prevMonth ? addMonths(prevMonth, -1) : null;
  if (!latestMonth || !prevMonth || !byMonth.has(prevMonth)) {
    throw new Error("Insufficient PAYEMS history");
  }

  const change = byMonth.get(latestMonth)! - byMonth.get(prevMonth)!;
  const prevChange =
    prevPrevMonth && byMonth.has(prevPrevMonth)
      ? byMonth.get(prevMonth)! - byMonth.get(prevPrevMonth)!
      : null;

  const delta = prevChange !== null ? change - prevChange : null;
  const changeFmt = delta !== null ? formatKDelta(delta) : null;

  return {
    headlineValue: formatThousandsChange(change),
    changeVsPriorDisplay: changeFmt?.value ?? null,
    changeSecondaryValue: changeFmt ? CHANGE_LABEL_FROM_PREVIOUS : null,
    changeVsPriorDirection: changeFmt?.direction ?? null,
    secondaryValue: null,
    observationDate: `${latestMonth}-01`,
  };
}

export function computeUnemploymentLevel(observations: FredObs[]): FredRowSnapshot {
  const byMonth = new Map(observations.map((o) => [monthKey(o.date), o.value]));
  const sorted = [...byMonth.keys()].sort();
  const latestMonth = sorted.at(-1);
  const prevMonth = latestMonth ? addMonths(latestMonth, -1) : null;
  if (!latestMonth || !byMonth.has(latestMonth)) throw new Error("No unemployment data");

  const level = byMonth.get(latestMonth)!;
  const prev = prevMonth && byMonth.has(prevMonth) ? byMonth.get(prevMonth)! : null;
  const delta = prev !== null ? level - prev : null;
  const changeFmt = delta !== null ? formatPpDelta(delta) : null;

  return {
    headlineValue: formatPct(level),
    changeVsPriorDisplay: changeFmt?.value ?? null,
    changeSecondaryValue: changeFmt ? CHANGE_LABEL_FROM_PREVIOUS : null,
    changeVsPriorDirection: changeFmt?.direction ?? null,
    secondaryValue: null,
    observationDate: `${latestMonth}-01`,
  };
}
