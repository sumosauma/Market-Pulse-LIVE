export type PolicyChangeKind = "cut" | "hike" | "unchanged" | "unknown";

export type PolicyRateFreshness = "live" | "cached" | "unverified";

export type PolicyNextDateSource = "official" | "rule-based" | "none";

export type PolicyBankId =
  | "fed"
  | "ecb"
  | "boe"
  | "boj"
  | "boc"
  | "rba"
  | "snb"
  | "riksbank"
  | "norges"
  | "tcmb"
  | "china-lpr";

export type PolicyRateRow = {
  id: PolicyBankId;
  bankFull: string;
  bankShort: string;
  countryId: string;
  region: string;
  rateDisplay: string | null;
  latestChange: {
    display: string;
    kind: PolicyChangeKind;
    dateIso?: string | null;
    dateDisplay?: string;
  } | null;
  nextDecisionIso: string | null;
  nextDecisionDisplay: string;
  nextDateSource: PolicyNextDateSource;
  isEstimatedDate: boolean;
  estimateLabel?: "est." | "approx." | "rule-based";
  sourceUrl: string;
  calendarSourceUrl?: string;
  applicableFrom: string;
  asOf: string;
  needsVerification?: boolean;
  subtitle?: string;
  freshness: PolicyRateFreshness;
  hasLiveSource: boolean;
  liveSourceLabel: string | null;
  unverifiedSince: string | null;
};

export type PolicyRatesPayload = Readonly<{
  rows: PolicyRateRow[];
  fetchedAt: string;
}>;

export const POLICY_RATES_CACHE_MS = 24 * 60 * 60 * 1000;

/** Central banks typically meet every 6–8 weeks. Dates farther out are treated as parser errors. */
export const NEXT_MEETING_MAX_DAYS = 120;

export function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function changeToneClass(kind: PolicyChangeKind): string {
  switch (kind) {
    case "cut":
      return "text-emerald-600 dark:text-emerald-400";
    case "hike":
      return "text-amber-600 dark:text-amber-400";
    case "unchanged":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function formatPolicyDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatPolicyRatePct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatPolicyRange(low: number, high: number): string {
  return `${low.toFixed(2)}–${high.toFixed(2)}%`;
}

export function changeFromBps(
  deltaBps: number | null,
  dateIso?: string | null,
): PolicyRateRow["latestChange"] {
  if (deltaBps === null || !Number.isFinite(deltaBps)) {
    return { display: "unknown", kind: "unknown", dateIso: dateIso ?? null, dateDisplay: formatPolicyDate(dateIso ?? null) };
  }
  const rounded = Math.round(deltaBps);
  if (rounded === 0) {
    return {
      display: "Unchanged",
      kind: "unchanged",
      dateIso: dateIso ?? null,
      dateDisplay: formatPolicyDate(dateIso ?? null),
    };
  }
  const kind: PolicyChangeKind = rounded > 0 ? "hike" : "cut";
  const abs = Math.abs(rounded);
  return {
    display: `${rounded > 0 ? "+" : "−"}${abs} bps`,
    kind,
    dateIso: dateIso ?? null,
    dateDisplay: formatPolicyDate(dateIso ?? null),
  };
}

export function utcTodayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isNextDecisionPassed(nextIso: string | null, now = new Date()): boolean {
  if (!nextIso) return false;
  return nextIso.slice(0, 10) < utcTodayIso(now);
}

/** True when a parsed next-meeting date is in the past or more than ~120 days out. */
export function isImplausibleNextDecision(nextIso: string | null, now = new Date()): boolean {
  if (!nextIso) return false;
  const today = utcTodayIso(now);
  const iso = nextIso.slice(0, 10);
  if (iso <= today) return true;
  return iso > isoPlusDays(today, NEXT_MEETING_MAX_DAYS);
}

export function getPolicyRatesAsOf(rows: PolicyRateRow[]): string {
  const dates = rows.map((r) => r.asOf).filter(Boolean).sort();
  return dates[dates.length - 1] ?? "—";
}

export function formatUnverifiedSince(iso: string | null): string {
  const formatted = formatPolicyDate(iso);
  return formatted === "—" ? "unknown date" : formatted;
}
