import { fetchNorgesBankSeriesObservationsSafe } from "../yieldCurves/norgesBankSdmx";
import { fetchRiksbankSeriesObservationsSafe } from "../yieldCurves/riksbankSwea";
import { getNextChinaLprPublication } from "./chinaLpr";
import {
  lastChangeFields,
  lastDecisionFromMeetingsAndSeries,
  lastDecisionFromTwoPrints,
  latestRate,
  type LastDecision,
  type RatePoint,
} from "./lastDecision";
import {
  fetchCalendarDates,
  fetchNextMeeting,
  fetchRiksbankMeetingDates,
  parseBocAnnouncementsForYear,
  parseBocRemainingDates,
  parseBoeMpcDates,
  parseBojMpmDates,
  parseEcbMonetaryPolicyDays,
  parseEcbPressConferenceDates,
  parseFedFomcMeetings,
  parseNorgesDecisionTable,
  parseNorgesNextDecision,
  parseRbaMpbDates,
  parseSnbAssessmentDates,
  parseTcmbMpcDecisionDates,
  pickUpcoming,
  timedFetchHtml,
  type NextMeetingResult,
} from "./nextMeetings";
import {
  scrapeBojPolicyRate,
  scrapeChinaLpr,
  scrapeSnbPolicyRate,
  scrapeTcmbOneWeekRepo,
} from "./scrapers";
import { getSeedRow } from "./seed";
import {
  formatPolicyDate,
  formatPolicyRange,
  formatPolicyRatePct,
  utcTodayIso,
  type PolicyBankId,
  type PolicyRateRow,
} from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export class NoLiveSourceError extends Error {
  constructor(bankId: PolicyBankId, detail: string) {
    super(`${bankId}: ${detail}`);
    this.name = "NoLiveSourceError";
  }
}

function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" }).finally(() =>
    clearTimeout(t),
  );
}

function latestSnapshot(points: RatePoint[]): { latestValue: number; asOf: string } {
  const snap = latestRate(points);
  return { latestValue: snap.value, asOf: snap.asOf };
}

function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

function parseLooseDate(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mdy = raw.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?,?\s+(\d{4})\b/i,
  );
  if (mdy) {
    const mon = MONTHS[mdy[1]!.toLowerCase()];
    if (!mon) return null;
    return `${mdy[3]}-${String(mon).padStart(2, "0")}-${String(Number(mdy[2])).padStart(2, "0")}`;
  }

  const dmy = raw.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i,
  );
  if (dmy) {
    const mon = MONTHS[dmy[2]!.toLowerCase()];
    if (!mon) return null;
    return `${dmy[3]}-${String(mon).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}`;
  }
  return null;
}

async function fetchNextIso(
  bankId: PolicyBankId,
  sourceUrl: string,
  parse: (html: string) => string[],
): Promise<string | null> {
  return (await fetchNextMeeting(bankId, sourceUrl, parse)).iso;
}

function withNextDate(
  liveNext: NextMeetingResult | string | null,
): Pick<
  PolicyRateRow,
  "nextDecisionIso" | "nextDecisionDisplay" | "nextDateSource" | "isEstimatedDate" | "estimateLabel"
> {
  const iso = typeof liveNext === "string" || liveNext == null ? liveNext : liveNext.iso;
  if (iso) {
    return {
      nextDecisionIso: iso,
      nextDecisionDisplay: formatPolicyDate(iso),
      nextDateSource: "official",
      isEstimatedDate: false,
      estimateLabel: undefined,
    };
  }
  return {
    nextDecisionIso: null,
    nextDecisionDisplay: "—",
    nextDateSource: "none",
    isEstimatedDate: false,
  };
}

async function fetchFredSeries(seriesId: string, limit = 400): Promise<RatePoint[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
    `&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  const parsed = (json.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  if (!parsed.length) throw new Error(`FRED ${seriesId} empty`);
  return parsed.reverse();
}

function parseEcbSdmx(json: unknown): RatePoint[] {
  const root = json as {
    data?: {
      dataSets?: Array<{ series?: Record<string, { observations?: Record<string, number[] | string[]> }> }>;
      structure?: { dimensions?: { observation?: Array<{ id?: string; values?: Array<{ id?: string }> }> } };
    };
    dataSets?: Array<{ series?: Record<string, { observations?: Record<string, number[] | string[]> }> }>;
    structure?: { dimensions?: { observation?: Array<{ id?: string; values?: Array<{ id?: string }> }> } };
  };
  const structure = root.structure ?? root.data?.structure;
  const dataSets = root.dataSets ?? root.data?.dataSets;
  const time = structure?.dimensions?.observation?.find((d) => d.id === "TIME_PERIOD")?.values ?? [];
  const series = Object.values(dataSets?.[0]?.series ?? {})[0];
  const obs = series?.observations ?? {};
  const points: RatePoint[] = [];
  for (const [idx, arr] of Object.entries(obs)) {
    const date = time[Number(idx)]?.id;
    const raw = Array.isArray(arr) ? arr[0] : NaN;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (date && Number.isFinite(value)) points.push({ date, value });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function parseBoeCsv(text: string): RatePoint[] {
  const points: RatePoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{2}\s+[A-Za-z]{3}\s+\d{4}),\s*([0-9.]+)/);
    if (!m) continue;
    const iso = parseLooseDate(m[1]!);
    const value = Number(m[2]);
    if (iso && Number.isFinite(value)) points.push({ date: iso, value });
  }
  return points;
}

function parseRbaCashRateCsv(text: string): RatePoint[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  let col = 1;
  for (const line of lines.slice(0, 40)) {
    const parts = line.split(",");
    const idx = parts.findIndex(
      (c) => /cash rate target/i.test(c) && !/interbank/i.test(c) && !/change in/i.test(c),
    );
    if (idx >= 0) {
      col = idx;
      break;
    }
  }
  const points: RatePoint[] = [];
  for (const line of lines) {
    const parts = line.split(",");
    const dateRaw = (parts[0]?.trim() ?? "").replace(/^"|"$/g, "");
    const iso = parseLooseDate(dateRaw.replace(/-/g, " "));
    const raw = (parts[col] ?? "").replace(/^"|"$/g, "").trim();
    if (!iso || !raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) points.push({ date: iso, value });
  }
  return points;
}

function liveRow(
  seed: PolicyRateRow,
  opts: {
    rateDisplay: string;
    applicableFrom: string;
    asOf: string;
    last: LastDecision;
    sourceUrl: string;
    liveSourceLabel: string;
    nextIso: string | null;
    subtitle?: string;
    nextDateSource?: PolicyRateRow["nextDateSource"];
    isEstimatedDate?: boolean;
    estimateLabel?: PolicyRateRow["estimateLabel"];
  },
): PolicyRateRow {
  const next = withNextDate(opts.nextIso);
  if (opts.nextDateSource) next.nextDateSource = opts.nextDateSource;
  if (opts.isEstimatedDate != null) next.isEstimatedDate = opts.isEstimatedDate;
  if (opts.estimateLabel) next.estimateLabel = opts.estimateLabel;
  return {
    ...seed,
    ...next,
    rateDisplay: opts.rateDisplay,
    latestChange: lastChangeFields(opts.last),
    sourceUrl: opts.sourceUrl,
    applicableFrom: opts.applicableFrom,
    asOf: opts.asOf,
    subtitle: opts.subtitle ?? seed.subtitle,
    freshness: "live",
    hasLiveSource: true,
    liveSourceLabel: opts.liveSourceLabel,
    unverifiedSince: null,
    needsVerification: false,
  };
}

async function fetchFed(): Promise<PolicyRateRow> {
  const seed = getSeedRow("fed");
  const [lower, upper, cal] = await Promise.all([
    fetchFredSeries("DFEDTARL"),
    fetchFredSeries("DFEDTARU"),
    fetchCalendarDates(
      "fed",
      "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
      parseFedFomcMeetings,
    ),
  ]);
  const low = latestSnapshot(lower);
  const high = latestSnapshot(upper);
  const last = lastDecisionFromMeetingsAndSeries(cal.dates, upper);
  return liveRow(seed, {
    rateDisplay: formatPolicyRange(low.latestValue, high.latestValue),
    applicableFrom: last.dateIso,
    asOf: high.asOf,
    last,
    sourceUrl: "https://fred.stlouisfed.org/series/DFEDTARU",
    liveSourceLabel: "FRED DFEDTARL/DFEDTARU",
    nextIso: cal.next.iso,
  });
}

async function fetchEcb(): Promise<PolicyRateRow> {
  const seed = getSeedRow("ecb");
  const url =
    `https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?startPeriod=${isoDaysAgo(800)}&format=jsondata`;
  const [res, cal, press] = await Promise.all([
    timedFetch(url, { headers: { Accept: "application/json", "User-Agent": UA } }),
    fetchCalendarDates(
      "ecb",
      "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
      parseEcbMonetaryPolicyDays,
    ),
    timedFetchHtml("https://www.ecb.europa.eu/press/press_conference/html/index.en.html"),
  ]);
  if (!res.ok) throw new Error(`ECB HTTP ${res.status}`);
  const points = parseEcbSdmx(await res.json());
  const snap = latestSnapshot(points);
  if (!press.ok) throw new Error(`ECB press conference index: ${press.error}`);
  const last = lastDecisionFromMeetingsAndSeries(parseEcbPressConferenceDates(press.html), points);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: seed.sourceUrl,
    liveSourceLabel: "ECB Data Portal DFR",
    nextIso: cal.next.iso,
    subtitle: "Deposit facility rate",
  });
}

async function fetchBoe(): Promise<PolicyRateRow> {
  const seed = getSeedRow("boe");
  const url =
    "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2024&Dateto=now&SeriesCodes=IUDBEDR&UsingCodes=Y&CSVF=TN";
  const [res, cal] = await Promise.all([
    timedFetch(url, { headers: { Accept: "text/csv,text/plain", "User-Agent": UA } }),
    fetchCalendarDates(
      "boe",
      "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates",
      parseBoeMpcDates,
    ),
  ]);
  if (!res.ok) throw new Error(`BoE HTTP ${res.status}`);
  const points = parseBoeCsv(await res.text());
  const snap = latestSnapshot(points);
  const last = lastDecisionFromMeetingsAndSeries(cal.dates, points);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: seed.sourceUrl,
    liveSourceLabel: "BoE IADB IUDBEDR",
    nextIso: cal.next.iso,
  });
}

const BOC_2026_SCHEDULE =
  "https://www.bankofcanada.ca/2025/08/bank-canada-publishes-2026-schedule-policy-interest-rate-announcements-other-major-publications/";
const BOC_2027_SCHEDULE =
  "https://www.bankofcanada.ca/2026/07/bank-canada-publishes-2027-schedule-policy-interest-rate-announcements-other-major-publications/";

async function fetchBoc(): Promise<PolicyRateRow> {
  const seed = getSeedRow("boc");
  const url = `https://www.bankofcanada.ca/valet/observations/V39079/json?start_date=${isoDaysAgo(800)}&end_date=${utcTodayIso()}`;
  const [res, page2026, page2027] = await Promise.all([
    timedFetch(url, { headers: { Accept: "application/json", "User-Agent": UA } }),
    timedFetchHtml(BOC_2026_SCHEDULE),
    timedFetchHtml(BOC_2027_SCHEDULE),
  ]);
  if (!res.ok) throw new Error(`BoC HTTP ${res.status}`);
  const json = (await res.json()) as {
    observations?: Array<{ d: string; V39079?: { v?: string } }>;
  };
  const points: RatePoint[] = (json.observations ?? [])
    .map((o) => ({ date: o.d, value: parseFloat(o.V39079?.v ?? "") }))
    .filter((p) => p.date && Number.isFinite(p.value));
  const snap = latestSnapshot(points);
  if (!page2026.ok) throw new Error(`BoC 2026 schedule: ${page2026.error}`);
  if (!page2027.ok) throw new Error(`BoC 2027 schedule: ${page2027.error}`);
  const dates = [
    ...parseBocAnnouncementsForYear(page2026.html, 2026),
    ...parseBocRemainingDates(page2027.html),
  ];
  const next = pickUpcoming(dates, {
    logId: "boc",
    snippet: `rawDates=${dates.join(", ")}`,
    sourceUrl: BOC_2027_SCHEDULE,
  });
  const last = lastDecisionFromMeetingsAndSeries(dates, points);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: "https://www.bankofcanada.ca/valet/observations/V39079/json",
    liveSourceLabel: "BoC Valet V39079",
    nextIso: next.iso,
  });
}

async function fetchRba(): Promise<PolicyRateRow> {
  const seed = getSeedRow("rba");
  const url = "https://www.rba.gov.au/statistics/tables/csv/f1-data.csv";
  const [res, cal] = await Promise.all([
    timedFetch(url, { headers: { Accept: "text/csv,text/plain", "User-Agent": UA } }),
    fetchCalendarDates(
      "rba",
      "https://www.rba.gov.au/schedules-events/board-meeting-schedules.html",
      parseRbaMpbDates,
    ),
  ]);
  if (!res.ok) throw new Error(`RBA HTTP ${res.status}`);
  const points = parseRbaCashRateCsv(await res.text());
  const snap = latestSnapshot(points);
  const last = lastDecisionFromMeetingsAndSeries(cal.dates, points);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: url,
    liveSourceLabel: "RBA Table F1 CSV",
    nextIso: cal.next.iso,
  });
}

async function fetchRiksbank(): Promise<PolicyRateRow> {
  const seed = getSeedRow("riksbank");
  const end = utcTodayIso();
  const start = isoDaysAgo(800);
  const [result, meetings] = await Promise.all([
    fetchRiksbankSeriesObservationsSafe("SECBREPOEFF", start, end),
    fetchRiksbankMeetingDates(),
  ]);
  if (!result.ok) throw new Error(result.error);
  const snap = latestSnapshot(result.rows);
  const last = lastDecisionFromMeetingsAndSeries(meetings.dates, result.rows);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: seed.sourceUrl,
    liveSourceLabel: "Riksbank SWEA SECBREPOEFF",
    nextIso: meetings.next.iso,
  });
}

const NORGES_DECISIONS =
  "https://www.norges-bank.no/en/topics/monetary-policy/policy-rate/Key-policy-rate-Monetary-policy-meetings-and-changes-in-the-policy-rate/";

async function fetchNorges(): Promise<PolicyRateRow> {
  const seed = getSeedRow("norges");
  const end = utcTodayIso();
  const start = isoDaysAgo(800);
  const [result, nextIso, tablePage] = await Promise.all([
    fetchNorgesBankSeriesObservationsSafe("IR", "B.KPRA.SD.R", start, end),
    fetchNextIso("norges", "https://www.norges-bank.no/en/topics/Monetary-policy/Policy-rate/", parseNorgesNextDecision),
    timedFetchHtml(NORGES_DECISIONS),
  ]);
  if (!result.ok) throw new Error(result.error);
  const snap = latestSnapshot(result.rows);
  if (!tablePage.ok) throw new Error(`Norges decisions table: ${tablePage.error}`);
  const decisions = parseNorgesDecisionTable(tablePage.html).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const last = lastDecisionFromTwoPrints(decisions[0]!, decisions[1]!);
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(snap.latestValue),
    applicableFrom: last.dateIso,
    asOf: snap.asOf,
    last,
    sourceUrl: seed.sourceUrl,
    liveSourceLabel: "Norges Bank SDMX IR B.KPRA.SD.R",
    nextIso,
  });
}

async function fetchBoj(): Promise<PolicyRateRow> {
  const seed = getSeedRow("boj");
  const scraped = await scrapeBojPolicyRate();
  const nextIso = await fetchNextIso(
    "boj",
    "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
    parseBojMpmDates,
  );
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(scraped.value),
    applicableFrom: scraped.applicableFrom,
    asOf: scraped.asOf,
    last: { changeBps: scraped.changeBps, dateIso: scraped.lastDateIso },
    sourceUrl: scraped.sourceUrl,
    liveSourceLabel: scraped.label,
    nextIso,
    subtitle: scraped.subtitle,
  });
}

async function fetchSnb(): Promise<PolicyRateRow> {
  const seed = getSeedRow("snb");
  const scraped = await scrapeSnbPolicyRate();
  const nextIso = await fetchNextIso(
    "snb",
    "https://www.snb.ch/en/services-events/digital-services/event-schedule",
    parseSnbAssessmentDates,
  );
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(scraped.value),
    applicableFrom: scraped.applicableFrom,
    asOf: scraped.asOf,
    last: { changeBps: scraped.changeBps, dateIso: scraped.lastDateIso },
    sourceUrl: scraped.sourceUrl,
    liveSourceLabel: scraped.label,
    nextIso,
  });
}

async function fetchTcmb(): Promise<PolicyRateRow> {
  const seed = getSeedRow("tcmb");
  const [scraped, cal] = await Promise.all([
    scrapeTcmbOneWeekRepo(),
    fetchCalendarDates(
      "tcmb",
      "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements/Calendar",
      parseTcmbMpcDecisionDates,
    ),
  ]);
  const series = scraped.points ?? [{ date: scraped.asOf, value: scraped.value }];
  const last =
    cal.dates.length >= 2
      ? lastDecisionFromMeetingsAndSeries(cal.dates, series)
      : { changeBps: scraped.changeBps, dateIso: scraped.lastDateIso };
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(scraped.value),
    applicableFrom: last.dateIso,
    asOf: scraped.asOf,
    last,
    sourceUrl: scraped.sourceUrl,
    liveSourceLabel: scraped.label,
    nextIso: cal.next.iso,
    subtitle: scraped.subtitle,
  });
}

async function fetchChinaLpr(): Promise<PolicyRateRow> {
  const seed = getSeedRow("china-lpr");
  const scraped = await scrapeChinaLpr();
  const pub = getNextChinaLprPublication();
  const next = pickUpcoming([pub.iso], {
    logId: "china-lpr",
    snippet: `rule: 20th of month (weekend roll) → ${pub.iso}`,
    sourceUrl: "https://www.chinamoney.com.cn/english/bmklpr/",
  });
  return liveRow(seed, {
    rateDisplay: formatPolicyRatePct(scraped.value),
    applicableFrom: scraped.applicableFrom,
    asOf: scraped.asOf,
    last: { changeBps: scraped.changeBps, dateIso: scraped.lastDateIso },
    sourceUrl: scraped.sourceUrl,
    liveSourceLabel: scraped.label,
    nextIso: next.iso,
    subtitle: scraped.subtitle,
    nextDateSource: "rule-based",
    isEstimatedDate: true,
    estimateLabel: "rule-based",
  });
}

export async function fetchPolicyRate(bankId: PolicyBankId): Promise<PolicyRateRow> {
  switch (bankId) {
    case "fed":
      return fetchFed();
    case "ecb":
      return fetchEcb();
    case "boe":
      return fetchBoe();
    case "boc":
      return fetchBoc();
    case "rba":
      return fetchRba();
    case "riksbank":
      return fetchRiksbank();
    case "norges":
      return fetchNorges();
    case "boj":
      return fetchBoj();
    case "snb":
      return fetchSnb();
    case "tcmb":
      return fetchTcmb();
    case "china-lpr":
      return fetchChinaLpr();
    default:
      throw new NoLiveSourceError(bankId, "Unknown bank");
  }
}
