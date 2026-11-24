/**
 * Completed-session Yahoo universe (strict vol>0), aligned asOf.
 * Investigation/validation helper — not used by the product path.
 */
import { contractLabel, MONTH_CODES } from "../src/lib/commodities/futuresCurve";
import {
  futuresCurveSpecById,
  loadFuturesTermStructure,
} from "../src/lib/commodities/futuresCurve.server";
import { SIGNAL_THRESHOLDS } from "../src/lib/commodities/signals";

const IDS = [
  "brent",
  "wti",
  "henry-hub",
  "ttf",
  "gold",
  "silver",
  "copper",
  "aluminium",
  "wheat",
  "corn",
] as const;

const completedBefore = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function addMonths(year: number, monthIndex: number, delta: number) {
  const absolute = year * 12 + monthIndex + delta;
  return { year: Math.floor(absolute / 12), monthIndex: ((absolute % 12) + 12) % 12 };
}
function monthsBetween(a: { year: number; monthIndex: number }, b: { year: number; monthIndex: number }) {
  return Math.abs(a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));
}
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

async function series(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
  const j = (await (await fetch(url)).json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> };
        meta?: { symbol?: string; instrumentType?: string; currency?: string };
      }>;
    };
  };
  const r = j.chart?.result?.[0];
  if (!r?.meta || r.meta.instrumentType !== "FUTURE" || r.meta.symbol !== symbol) return null;
  const bars: Array<{ date: string; close: number; volume: number | null }> = [];
  for (let i = 0; i < (r.timestamp ?? []).length; i++) {
    const c = r.indicators?.quote?.[0]?.close?.[i];
    const v = r.indicators?.quote?.[0]?.volume?.[i];
    const t = r.timestamp?.[i];
    if (typeof c !== "number" || !(c > 0) || typeof t !== "number") continue;
    bars.push({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      close: c,
      volume: typeof v === "number" ? v : null,
    });
  }
  return { bars, currency: r.meta.currency ?? null };
}

const term = await loadFuturesTermStructure();
type Row = {
  id: string;
  name: string;
  front: string;
  six: string;
  asOf: string;
  prior: string;
  frontRet: number;
  sixRet: number;
  reason?: string;
};
const candidates: Row[] = [];

for (const id of IDS) {
  const curve = term.curves.find((c) => c.id === id);
  const spec = futuresCurveSpecById(id);
  if (!curve?.enabled || !curve.sessionDate || !spec) continue;
  const priced = curve.points
    .filter((p) => !p.gap && p.price != null && p.price > 0)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));
  const front = priced[0];
  const target = addMonths(
    new Date(`${curve.sessionDate}T00:00:00Z`).getUTCFullYear(),
    new Date(`${curve.sessionDate}T00:00:00Z`).getUTCMonth(),
    SIGNAL_THRESHOLDS.futuresRepricingTargetMonths,
  );
  let six = priced[0];
  let best = Infinity;
  for (const p of priced) {
    const d = monthsBetween(p, target);
    if (d < best) {
      best = d;
      six = p;
    }
  }
  if (!front || !six || best > SIGNAL_THRESHOLDS.futuresRepricingMaxTargetDistanceMonths) continue;
  const frontSym = `${spec.root}${MONTH_CODES[front.monthIndex]}${String(front.year).slice(2)}.${spec.venue}`;
  const sixSym = `${spec.root}${MONTH_CODES[six.monthIndex]}${String(six.year).slice(2)}.${spec.venue}`;
  const [fs, ss] = await Promise.all([series(frontSym), series(sixSym)]);
  if (!fs || !ss || fs.currency !== ss.currency || fs.currency !== spec.currency) {
    candidates.push({
      id,
      name: curve.name,
      front: frontSym,
      six: sixSym,
      asOf: "",
      prior: "",
      frontRet: NaN,
      sixRet: NaN,
      reason: "series/currency fail",
    });
    continue;
  }
  const sixBy = new Map(ss.bars.map((b) => [b.date, b]));
  const common = fs.bars.map((b) => b.date).filter((d) => sixBy.has(d) && d < completedBefore).sort();
  const asOf = common[common.length - 1];
  if (!asOf) {
    candidates.push({
      id,
      name: curve.name,
      front: frontSym,
      six: sixSym,
      asOf: "",
      prior: "",
      frontRet: NaN,
      sixRet: NaN,
      reason: "no completed common asOf",
    });
    continue;
  }
  let prior: string | null = null;
  let bestDist = Infinity;
  for (const d of common) {
    if (d >= asOf) continue;
    const lag = daysBetween(d, asOf);
    const dist = Math.abs(lag - SIGNAL_THRESHOLDS.futuresRepricingLookbackDays);
    if (dist > SIGNAL_THRESHOLDS.futuresRepricingLookbackToleranceDays) continue;
    if (dist < bestDist) {
      bestDist = dist;
      prior = d;
    }
  }
  if (!prior) {
    candidates.push({
      id,
      name: curve.name,
      front: frontSym,
      six: sixSym,
      asOf,
      prior: "",
      frontRet: NaN,
      sixRet: NaN,
      reason: "no prior in ±5d",
    });
    continue;
  }
  const fa = fs.bars.find((b) => b.date === asOf)!;
  const fp = fs.bars.find((b) => b.date === prior)!;
  const sa = sixBy.get(asOf)!;
  const sp = sixBy.get(prior)!;
  if (fa.volume === 0 || sa.volume === 0 || fp.volume === 0 || sp.volume === 0) {
    candidates.push({
      id,
      name: curve.name,
      front: `${contractLabel(front.monthIndex, front.year)} (${frontSym})`,
      six: `${contractLabel(six.monthIndex, six.year)} (${sixSym})`,
      asOf,
      prior,
      frontRet: fa.close / fp.close - 1,
      sixRet: sa.close / sp.close - 1,
      reason: "zero volume",
    });
    continue;
  }
  candidates.push({
    id,
    name: curve.name,
    front: `${contractLabel(front.monthIndex, front.year)} (${frontSym})`,
    six: `${contractLabel(six.monthIndex, six.year)} (${sixSym})`,
    asOf,
    prior,
    frontRet: fa.close / fp.close - 1,
    sixRet: sa.close / sp.close - 1,
  });
}

const eligible = candidates.filter((c) => !c.reason && Number.isFinite(c.sixRet));
const asOfCounts = new Map<string, number>();
for (const c of eligible) asOfCounts.set(c.asOf, (asOfCounts.get(c.asOf) ?? 0) + 1);
const sharedAsOf = [...asOfCounts.entries()].sort((a, b) => b[0].localeCompare(a[0])).find(([, n]) => n >= 2)?.[0];
const aligned = eligible.filter((c) => c.asOf === sharedAsOf).sort((a, b) => Math.abs(b.sixRet) - Math.abs(a.sixRet));

console.log(JSON.stringify({ completedBefore, sharedAsOf, eligibleCount: aligned.length, aligned, excluded: candidates.filter((c) => c.reason) }, null, 2));
