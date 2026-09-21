import { formatPolicyDate, isoPlusDays, NEXT_MEETING_MAX_DAYS, utcTodayIso } from "./types";

export { NEXT_MEETING_MAX_DAYS };

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

export type NextMeetingResult = {
  iso: string | null;
  display: string;
  sourceUrl: string;
  snippet: string;
  reason: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export async function timedFetchHtml(url: string, timeoutMs = 12_000): Promise<{ ok: true; html: string; status: number } | { ok: false; status: number; error: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,application/json,*/*", "User-Agent": UA },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const html = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, html, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;|&#8211;|&mdash;/gi, "–")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMonthDayYear(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmyDot = raw.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (dmyDot) {
    return `${dmyDot[3]}-${pad2(Number(dmyDot[2]))}-${pad2(Number(dmyDot[1]))}`;
  }

  const dmySlash = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmySlash) {
    const day = Number(dmySlash[1]);
    const month = Number(dmySlash[2]);
    if (month > 12 && day <= 12) {
      return `${dmySlash[3]}-${pad2(day)}-${pad2(month)}`;
    }
    return `${dmySlash[3]}-${pad2(month)}-${pad2(day)}`;
  }

  const mdy = raw.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?,?\s+(\d{4})\b/i,
  );
  if (mdy) {
    const mon = MONTHS[mdy[1]!.toLowerCase()];
    if (!mon) return null;
    return `${mdy[3]}-${pad2(mon)}-${pad2(Number(mdy[2]))}`;
  }

  const dmy = raw.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i,
  );
  if (dmy) {
    const mon = MONTHS[dmy[2]!.toLowerCase()];
    if (!mon) return null;
    return `${dmy[3]}-${pad2(mon)}-${pad2(Number(dmy[1]))}`;
  }
  return null;
}

export function pickUpcoming(
  dates: string[],
  opts: { today?: string; maxDays?: number; logId: string; snippet: string; sourceUrl: string },
): NextMeetingResult {
  const today = opts.today ?? utcTodayIso();
  const maxDays = opts.maxDays ?? NEXT_MEETING_MAX_DAYS;
  const maxIso = isoPlusDays(today, maxDays);
  const unique = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const after = unique.filter((d) => d > today);
  const inWindow = after.filter((d) => d <= maxIso);

  let iso: string | null = null;
  let reason: string;
  if (!unique.length) {
    reason = "parser found no dated meetings in source";
  } else if (!after.length) {
    reason = `all parsed dates are today or earlier (latest=${unique[unique.length - 1]})`;
  } else if (!inWindow.length) {
    reason = `next parsed date ${after[0]} is more than ${maxDays} days out — treated as invalid`;
    console.warn(`[POLICY][next][${opts.logId}] WARNING ${reason}`);
  } else {
    iso = inWindow[0]!;
    reason = `first date strictly after ${today} within ${maxDays}d (${unique.length} candidates)`;
  }

  const snippet = opts.snippet.slice(0, 220);
  const upcoming = iso != null && iso > today;
  console.log(
    `[POLICY][next][${opts.logId}] source=${opts.sourceUrl} snippet=${JSON.stringify(snippet)} candidates=${unique.join(",") || "(none)"} parsed=${iso ?? "—"} isNextUpcoming=${upcoming} reason=${reason}`,
  );

  return {
    iso,
    display: iso ? formatPolicyDate(iso) : "—",
    sourceUrl: opts.sourceUrl,
    snippet,
    reason,
  };
}

function emptyResult(sourceUrl: string, reason: string, logId: string, snippet = ""): NextMeetingResult {
  console.log(`[POLICY][next][${logId}] FAIL ${reason} source=${sourceUrl}`);
  return { iso: null, display: "—", sourceUrl, snippet: snippet.slice(0, 220), reason };
}

/** Fed: only `.fomc-meeting` month+day-range under "YYYY FOMC Meetings". Decision day = last day of the range. Ignore minutes "Released …" dates. */
export function parseFedFomcMeetings(html: string): string[] {
  const out: string[] = [];
  const blocks = html.split(/(\d{4})\s+FOMC Meetings/i);
  for (let i = 1; i < blocks.length; i += 2) {
    const y = Number(blocks[i]);
    const chunk = blocks[i + 1] ?? "";
    if (!Number.isFinite(y) || y < 2020 || y > 2100) continue;
    const rows = [
      ...chunk.matchAll(
        /fomc-meeting__month[\s\S]*?<strong>\s*([A-Za-z]+)\s*<\/strong>[\s\S]*?fomc-meeting__date[^>]*>\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?/gi,
      ),
    ];
    for (const row of rows) {
      const month = MONTHS[row[1]!.toLowerCase()];
      if (!month) continue;
      const endDay = Number(row[3] ?? row[2]);
      if (!Number.isFinite(endDay)) continue;
      out.push(`${y}-${pad2(month)}-${pad2(endDay)}`);
    }
  }
  if (!out.length) throw new Error("FOMC calendar had no fomc-meeting month/date rows");
  return out;
}

/** ECB: DD/MM/YYYY entries labelled monetary policy meeting Day 2 (decision + press conference). */
export function parseEcbMonetaryPolicyDays(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>\s*([\s\S]*?)<\/dd>/gi,
  )) {
    const body = m[4] ?? "";
    if (!/monetary policy meeting/i.test(body)) continue;
    if (!/Day 2|press conference/i.test(body)) continue;
    out.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  if (!out.length) throw new Error("ECB calendar had no monetary-policy Day 2 / press-conference dates");
  return out;
}

export function parseBoeMpcDates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/datetime="(\d{4}-\d{2}-\d{2})"/g)) out.push(m[1]!);
  const nextDue = html.match(/Next due:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (nextDue) {
    const iso = parseMonthDayYear(nextDue[1]!);
    if (iso) out.push(iso);
  }
  const chunks = html.split(/<(?:h2|h3|caption)[^>]*>/i);
  for (const chunk of chunks) {
    const yearM = chunk.match(/\b(20\d{2})\b/);
    if (!yearM) continue;
    const year = yearM[1]!;
    const table = chunk.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? chunk.slice(0, 5000);
    for (const m of table.matchAll(
      /Thursday\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi,
    )) {
      const month = MONTHS[m[2]!.toLowerCase()];
      if (!month) continue;
      out.push(`${year}-${pad2(month)}-${pad2(Number(m[1]))}`);
    }
  }
  const unique = [...new Set(out)];
  if (!unique.length) throw new Error("BoE upcoming MPC page had no dated announcements");
  return unique;
}

function parseBocWeekdayList(html: string, heading: RegExp, year: number): string[] {
  const idx = html.search(heading);
  if (idx < 0) return [];
  const slice = html.slice(idx, idx + 1600);
  const ulEnd = slice.search(/<\/ul>/i);
  const body = ulEnd >= 0 ? slice.slice(0, ulEnd) : slice;
  const out: string[] = [];
  for (const m of body.matchAll(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/gi,
  )) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (!month) continue;
    out.push(`${year}-${pad2(month)}-${pad2(Number(m[2]))}`);
  }
  return out;
}

export function parseBocAnnouncementsForYear(html: string, year: number): string[] {
  return parseBocWeekdayList(html, new RegExp(`interest rate announcements for ${year}`, "i"), year);
}

/** BoC 2027-schedule press release: 2027 list + remaining 2026 dates under "September 2026 through December 2026". */
export function parseBocRemainingDates(html: string): string[] {
  const remainder = parseBocWeekdayList(
    html,
    /September 2026 through December 2026/i,
    2026,
  );
  const y2027 = parseBocAnnouncementsForYear(html, 2027);
  const out = [...remainder, ...y2027];
  if (!out.length) throw new Error("BoC schedule page had no policy-rate announcement weekday dates");
  return out;
}

/** ECB press-conference index: current + previous Governing Council monetary-policy dates. */
export function parseEcbPressConferenceDates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/[?&]date=(\d{4}-\d{2}-\d{2})/g)) out.push(m[1]!);
  for (const m of html.matchAll(/ecb\.(?:is|mp)(\d{2})(\d{2})(\d{2})/gi)) {
    const yy = Number(m[1]);
    const year = yy >= 80 ? 1900 + yy : 2000 + yy;
    out.push(`${year}-${m[2]}-${m[3]}`);
  }
  const current =
    html.match(/class="date-picker[^"]*"[^>]*>\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ??
    html.match(/class="image-date">\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (current) {
    const iso = parseMonthDayYear(current[1]!);
    if (iso) out.push(iso);
  }
  const prev = html.match(/button-lower">\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (prev) {
    const iso = parseMonthDayYear(prev[1]!);
    if (iso) out.push(iso);
  }
  const unique = [...new Set(out)].sort();
  if (unique.length < 2) {
    throw new Error(
      `ECB press conference index had fewer than two dated GC meetings (got ${unique.join(",") || "none"})`,
    );
  }
  return unique;
}

export function parseNorgesDecisionTable(html: string): Array<{ date: string; value: number }> {
  const text = stripTags(html);
  const rows = [
    ...text.matchAll(/(\d{4}-\d{2}-\d{2})\s+([0-9]+(?:\.[0-9]+)?)\s+[0-9.]+(?:\s+[0-9.]+)?/g),
  ].map((r) => ({ date: r[1]!, value: Number(r[2]) }));
  const unique: Array<{ date: string; value: number }> = [];
  for (const row of rows) {
    if (!unique.some((u) => u.date === row.date)) unique.push(row);
  }
  if (unique.length < 2) throw new Error("Norges policy-rate decisions table had fewer than two rows");
  return unique;
}

/** RBA: "Board meeting schedules YYYY" table, Monetary Policy Board column, last day of range. */
export function parseRbaMpbDates(html: string): string[] {
  const out: string[] = [];
  const tables = html.split(/Board meeting schedules (\d{4})/i);
  for (let i = 1; i < tables.length; i += 2) {
    const year = Number(tables[i]);
    const chunk = tables[i + 1] ?? "";
    const body = chunk.split(/Board meeting schedules \d{4}/i)[0] ?? chunk;
    for (const m of body.matchAll(
      /<td>(\d{1,2})(?:&ndash;|–|-|&#8211;)(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)<\/td>/gi,
    )) {
      const month = MONTHS[m[3]!.toLowerCase()];
      if (!month) continue;
      out.push(`${year}-${pad2(month)}-${pad2(Number(m[2]))}`);
    }
  }
  if (!out.length) throw new Error("RBA Monetary Policy Board table had no date ranges");
  return out;
}

export function parseNorgesNextDecision(html: string): string[] {
  const text = stripTags(html);
  const m = text.match(/Next policy rate decision will be announced on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (!m) throw new Error("Norges page missing 'Next policy rate decision will be announced on …'");
  const iso = parseMonthDayYear(m[1]!);
  return iso ? [iso] : [];
}

export function parseBojMpmDates(html: string): string[] {
  const out: string[] = [];
  const sections = html.split(/<h2[^>]*id="p(\d{4})"/i);
  for (let i = 1; i < sections.length; i += 2) {
    const year = Number(sections[i]);
    const chunk = sections[i + 1] ?? "";
    const firstCol = [...chunk.matchAll(/<tr>[\s\S]*?<td>([\s\S]*?)<\/td>/gi)];
    for (const cell of firstCol) {
      const text = stripTags(cell[1] ?? "");
      const m = text.match(
        /(Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}[^,]*,\s+(\d{1,2})\s*\(/i,
      );
      if (!m) continue;
      const month = MONTHS[m[1]!.toLowerCase().replace(".", "")];
      if (!month) continue;
      out.push(`${year}-${pad2(month)}-${pad2(Number(m[2]))}`);
    }
  }
  if (!out.length) throw new Error("BoJ MPM table had no Date of MPM ranges");
  return out;
}

export function parseSnbAssessmentDates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /Monetary policy assessment of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*\(press release\)/gi,
  )) {
    const iso = parseMonthDayYear(m[1]!);
    if (iso) out.push(iso);
  }
  if (!out.length) throw new Error("SNB event schedule had no 'Monetary policy assessment of … (press release)' rows");
  return out;
}

export function parseTcmbMpcDecisionDates(html: string): string[] {
  const table = html.match(/MONETARY POLICY COMMITTEE MEETING[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!table) throw new Error("TCMB calendar missing MPC table");
  const out: string[] = [];
  for (const row of table[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const firstCell = row[1]!.match(/<td[^>]*>\s*([^<]+)/i);
    const iso = firstCell ? parseMonthDayYear(firstCell[1]!.trim()) : null;
    if (iso) out.push(iso);
  }
  if (!out.length) throw new Error("TCMB MPC table had no dates in column 1");
  return out;
}

export function parseRiksbankPublicationDates(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /Publication of monetary policy decision[\s\S]{0,900}?href="\/en-gb\/press-and-published\/calendar\/calendar-\d{4}\/(\d{4}-\d{2}-\d{2})\/"/gi,
  )) {
    out.push(m[1]!);
  }
  return out;
}

export async function fetchCalendarDates(
  bankId: string,
  sourceUrl: string,
  parse: (html: string) => string[],
): Promise<{ dates: string[]; next: NextMeetingResult }> {
  const fetched = await timedFetchHtml(sourceUrl);
  if (!fetched.ok) {
    return { dates: [], next: emptyResult(sourceUrl, `fetch failed: ${fetched.error}`, bankId) };
  }
  try {
    const dates = parse(fetched.html);
    const snippet = `rawDates=${dates.join(", ")} | ${stripTags(fetched.html).slice(0, 160)}`;
    return { dates, next: pickUpcoming(dates, { logId: bankId, snippet, sourceUrl }) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { dates: [], next: emptyResult(sourceUrl, msg, bankId, stripTags(fetched.html).slice(0, 180)) };
  }
}

export async function fetchNextMeeting(
  bankId: string,
  sourceUrl: string,
  parse: (html: string) => string[],
): Promise<NextMeetingResult> {
  return (await fetchCalendarDates(bankId, sourceUrl, parse)).next;
}

export async function fetchRiksbankMeetingDates(today = utcTodayIso()): Promise<{ dates: string[]; next: NextMeetingResult }> {
  const year = Number(today.slice(0, 4));
  const startMonth = Number(today.slice(5, 7));
  const sourceUrl = `https://www.riksbank.se/en-gb/press-and-published/calendar/calendar-${year}/`;
  const dates: string[] = [];
  const snippets: string[] = [];
  for (let add = -4; add <= 5; add++) {
    const idx = startMonth - 1 + add;
    const y = year + Math.floor(idx / 12);
    const month = ((idx % 12) + 12) % 12 + 1;
    const url = `https://www.riksbank.se/en-gb/press-and-published/calendar/calendar-${y}/?month=${month}`;
    const fetched = await timedFetchHtml(url);
    if (!fetched.ok) {
      snippets.push(`${url}: ${fetched.error}`);
      continue;
    }
    const found = parseRiksbankPublicationDates(fetched.html);
    dates.push(...found);
    if (found.length) snippets.push(`${y}-${pad2(month)}:${found.join(",")}`);
  }
  const unique = [...new Set(dates)].sort();
  if (!unique.length) {
    return {
      dates: [],
      next: emptyResult(sourceUrl, "no 'Publication of monetary policy decision' events in nearby months", "riksbank", snippets.join(" | ")),
    };
  }
  return {
    dates: unique,
    next: pickUpcoming(unique, { logId: "riksbank", snippet: snippets.join(" | "), sourceUrl }),
  };
}

export async function fetchRiksbankNextMeeting(today = utcTodayIso()): Promise<NextMeetingResult> {
  return (await fetchRiksbankMeetingDates(today)).next;
}
