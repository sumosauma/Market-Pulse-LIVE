/**
 * Seed / last-known fallback only. Live fetchers are the primary source.
 * These values are never presented as current without an unverified flag.
 */
import { getNextChinaLprPublication } from "./chinaLpr";
import type { PolicyRateRow } from "./types";

type SeedRow = Omit<
  PolicyRateRow,
  "freshness" | "hasLiveSource" | "liveSourceLabel" | "unverifiedSince" | "nextDecisionDisplay"
> & {
  nextDecisionDisplay?: string;
};

const SEED: SeedRow[] = [
  {
    id: "fed",
    bankFull: "Federal Reserve",
    bankShort: "Fed",
    countryId: "US",
    region: "United States",
    rateDisplay: "3.50–3.75%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-07-29",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl: "https://fred.stlouisfed.org/series/DFEDTARU",
    calendarSourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    applicableFrom: "2025-12-11",
    asOf: "2026-04-29",
    needsVerification: true,
  },
  {
    id: "ecb",
    bankFull: "European Central Bank",
    bankShort: "ECB",
    countryId: "EU",
    region: "Euro Area",
    rateDisplay: "2.25%",
    latestChange: { display: "+25 bps", kind: "hike" },
    nextDecisionIso: "2026-07-23",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl:
      "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html",
    calendarSourceUrl: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
    applicableFrom: "2026-06-17",
    asOf: "2026-06-11",
    subtitle: "Deposit facility rate",
  },
  {
    id: "boe",
    bankFull: "Bank of England",
    bankShort: "BoE",
    countryId: "GB",
    region: "United Kingdom",
    rateDisplay: "3.75%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-06-18",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl: "https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp",
    calendarSourceUrl: "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates",
    applicableFrom: "2025-12-18",
    asOf: "2026-04-30",
  },
  {
    id: "boj",
    bankFull: "Bank of Japan",
    bankShort: "BoJ",
    countryId: "JP",
    region: "Japan",
    rateDisplay: "1.00%",
    latestChange: { display: "+25 bps", kind: "hike" },
    nextDecisionIso: "2026-07-31",
    nextDateSource: "none",
    isEstimatedDate: true,
    estimateLabel: "est.",
    sourceUrl: "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
    calendarSourceUrl: "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
    applicableFrom: "2026-06-17",
    asOf: "2026-06-16",
    subtitle: "Overnight call rate target",
  },
  {
    id: "boc",
    bankFull: "Bank of Canada",
    bankShort: "BoC",
    countryId: "CA",
    region: "Canada",
    rateDisplay: "2.25%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-07-15",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl: "https://www.bankofcanada.ca/valet/observations/V39079/json",
    calendarSourceUrl:
      "https://www.bankofcanada.ca/2026/07/bank-canada-publishes-2027-schedule-policy-interest-rate-announcements-other-major-publications/",
    applicableFrom: "2026-01-28",
    asOf: "2026-06-10",
  },
  {
    id: "rba",
    bankFull: "Reserve Bank of Australia",
    bankShort: "RBA",
    countryId: "AU",
    region: "Australia",
    rateDisplay: "4.35%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-08-11",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl: "https://www.rba.gov.au/statistics/tables/csv/f1-data.csv",
    calendarSourceUrl: "https://www.rba.gov.au/schedules-events/board-meeting-schedules.html",
    applicableFrom: "2026-05-05",
    asOf: "2026-06-16",
  },
  {
    id: "snb",
    bankFull: "Swiss National Bank",
    bankShort: "SNB",
    countryId: "CH",
    region: "Switzerland",
    rateDisplay: "0.00%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-06-19",
    nextDateSource: "none",
    isEstimatedDate: true,
    estimateLabel: "est.",
    sourceUrl: "https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions",
    calendarSourceUrl: "https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions",
    applicableFrom: "2025-03-20",
    asOf: "2026-03-19",
    subtitle: "SNB policy rate",
  },
  {
    id: "riksbank",
    bankFull: "Sveriges Riksbank",
    bankShort: "Riksbank",
    countryId: "SE",
    region: "Sweden",
    rateDisplay: "1.75%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-08-20",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl:
      "https://www.riksbank.se/en-gb/statistics/interest-rates-and-exchange-rates/policy-rate-deposit-and-lending-rate/",
    calendarSourceUrl:
      "https://www.riksbank.se/en-gb/press-and-published/calendar/",
    applicableFrom: "2026-06-24",
    asOf: "2026-06-17",
  },
  {
    id: "norges",
    bankFull: "Norges Bank",
    bankShort: "NB",
    countryId: "NO",
    region: "Norway",
    rateDisplay: "4.25%",
    latestChange: { display: "+25 bps", kind: "hike" },
    nextDecisionIso: "2026-09-24",
    nextDateSource: "official",
    isEstimatedDate: false,
    sourceUrl: "https://www.norges-bank.no/en/topics/Monetary-policy/Policy-rate/",
    calendarSourceUrl: "https://www.norges-bank.no/en/topics/monetary-policy/policy-rate/",
    applicableFrom: "2026-05-08",
    asOf: "2026-05-07",
  },
  {
    id: "tcmb",
    bankFull: "Central Bank of the Republic of Türkiye",
    bankShort: "TCMB",
    countryId: "TR",
    region: "Turkey",
    rateDisplay: "37.00%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: "2026-07-23",
    nextDateSource: "none",
    isEstimatedDate: true,
    estimateLabel: "est.",
    sourceUrl: "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements/Calendar",
    calendarSourceUrl:
      "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements/Calendar",
    applicableFrom: "2026-01-22",
    asOf: "2026-06-11",
    subtitle: "1W repo",
  },
];

const LIVE_SOURCE_BANKS = new Set([
  "fed",
  "ecb",
  "boe",
  "boj",
  "boc",
  "rba",
  "snb",
  "riksbank",
  "norges",
  "tcmb",
  "china-lpr",
]);

export function getSeedRows(now = new Date()): PolicyRateRow[] {
  const chinaNext = getNextChinaLprPublication(now);
  const china: PolicyRateRow = {
    id: "china-lpr",
    bankFull: "China Loan Prime Rate",
    bankShort: "LPR",
    countryId: "CN",
    region: "China",
    rateDisplay: "3.00%",
    latestChange: { display: "unchanged", kind: "unchanged" },
    nextDecisionIso: chinaNext.iso,
    nextDecisionDisplay: chinaNext.display,
    nextDateSource: "rule-based",
    isEstimatedDate: true,
    estimateLabel: "rule-based",
    sourceUrl: "https://www.chinamoney.com.cn/english/bmklpr/",
    calendarSourceUrl: "https://www.chinamoney.com.cn/english/bmklpr/",
    applicableFrom: "2026-05-20",
    asOf: "2026-05-20",
    subtitle: "1Y LPR · monthly publication, not MPC",
    freshness: "unverified",
    hasLiveSource: true,
    liveSourceLabel: null,
    unverifiedSince: "2026-05-20",
    needsVerification: true,
  };

  return [
    ...SEED.map((row) => ({
      ...row,
      nextDecisionDisplay: row.nextDecisionIso
        ? new Date(`${row.nextDecisionIso}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })
        : "—",
      freshness: "unverified" as const,
      hasLiveSource: LIVE_SOURCE_BANKS.has(row.id),
      liveSourceLabel: null,
      unverifiedSince: row.asOf,
      needsVerification: true,
    })),
    china,
  ];
}

export function getSeedRow(id: PolicyRateRow["id"], now = new Date()): PolicyRateRow {
  const row = getSeedRows(now).find((r) => r.id === id);
  if (!row) throw new Error(`Unknown policy bank: ${id}`);
  return row;
}

export { LIVE_SOURCE_BANKS };
