import {
  parseMonthDayYear,
  stripTags,
  timedFetchHtml,
} from "./nextMeetings";
import { utcTodayIso } from "./types";

const SNB_DECISIONS = "https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions";
const TCMB_REPO =
  "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Core+Functions/Monetary+Policy/Central+Bank+Interest+Rates/1+Week+Repo";
const CHINA_LPR = "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/LprHis?pageNo=1&pageSize=12";

export type ScrapedRate = {
  value: number;
  asOf: string;
  applicableFrom: string;
  changeBps: number;
  lastDateIso: string;
  sourceUrl: string;
  label: string;
  subtitle?: string;
  points?: Array<{ date: string; value: number }>;
};

function fail(label: string, detail: string): never {
  const msg = `${label}: ${detail}`;
  console.error(`[POLICY][scrape] ${msg}`);
  throw new Error(msg);
}

export async function scrapeBojPolicyRate(): Promise<ScrapedRate> {
  const year = Number(utcTodayIso().slice(0, 4));
  const statementsUrl = `https://www.boj.or.jp/en/mopo/mpmdeci/state_${year}/index.htm`;
  const speechesUrl = `https://www.boj.or.jp/en/about/press/koen_${year}/index.htm`;

  let statements = await timedFetchHtml(statementsUrl);
  if (!statements.ok) {
    const prev = await timedFetchHtml(`https://www.boj.or.jp/en/mopo/mpmdeci/state_${year - 1}/index.htm`);
    if (!prev.ok) fail("BoJ statements", statements.error);
    statements = prev;
  }

  const html = statements.html.replace(/&nbsp;/gi, " ");
  const dated = [
    ...html.matchAll(
      /<(?:td)[^>]*>\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June|July|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),\s+(\d{4})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi,
    ),
  ]
    .map((m) => {
      const title = stripTags(m[4] ?? "");
      const iso = parseMonthDayYear(`${m[1]} ${m[2]}, ${m[3]}`);
      if (!iso) return null;
      if (/\(Reference\)/i.test(title)) return null;
      if (/Change in the Guideline for Money Market Operations/i.test(title)) {
        return { iso, kind: "change" as const, title };
      }
      if (/^Statement on Monetary Policy/i.test(title)) {
        return { iso, kind: "hold" as const, title };
      }
      return null;
    })
    .filter((row): row is { iso: string; kind: "change" | "hold"; title: string } => row != null);

  if (!dated.length) fail("BoJ statements", "no dated Statement/Change rows after decoding &nbsp;");

  const unique: Array<{ iso: string; kind: "change" | "hold"; title: string }> = [];
  for (const row of dated) {
    if (!unique.some((u) => u.iso === row.iso)) unique.push(row);
  }
  const last = unique[0]!;
  const prev = unique[1];
  const lastChange = dated.find((d) => d.kind === "change");
  const speeches = await timedFetchHtml(speechesUrl);
  if (!speeches.ok) fail("BoJ speeches index", speeches.error);
  const speechHrefs = [
    ...speeches.html.matchAll(/href="(\/en\/about\/press\/koen_\d{4}\/ko\d+[a-z]?\.htm)"/gi),
  ].map((m) => `https://www.boj.or.jp${m[1]}`);
  if (!speechHrefs.length) fail("BoJ speeches", "no HTML speech links on koen index");

  let parsed: { value: number; snippet: string; url: string } | null = null;
  for (const url of speechHrefs.slice(0, 10)) {
    const page = await timedFetchHtml(url);
    if (!page.ok) continue;
    const text = stripTags(page.html);
    const m = text.match(
      /around\s+([0-9.]+)\s+percent\s+at the most recent MPM held in\s+([A-Za-z]+\s+\d{4})/i,
    );
    if (!m) continue;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      fail("BoJ speech", `implausible policy rate ${m[1]} in ${url}`);
    }
    parsed = { value, snippet: m[0], url };
    console.log(`[POLICY][scrape][boj] ${url} snippet=${JSON.stringify(m[0])} rate=${value}`);
    break;
  }
  if (!parsed) {
    fail(
      "BoJ",
      "no HTML speech contained 'around X.X percent at the most recent MPM' — statement PDFs are not plaintext",
    );
  }

  console.log(
    `[POLICY][scrape][boj] lastDecision=${last.iso} ${last.kind} prev=${prev?.iso ?? "—"} lastChange=${lastChange?.iso ?? "—"} titles=${dated
      .slice(0, 4)
      .map((d) => `${d.iso}:${d.kind}`)
      .join(",")}`,
  );
  return {
    value: parsed.value,
    asOf: last.iso,
    applicableFrom: last.kind === "hold" ? last.iso : (lastChange?.iso ?? last.iso),
    changeBps: last.kind === "hold" ? 0 : 0,
    lastDateIso: last.iso,
    sourceUrl: statementsUrl,
    label: "BoJ statements + Governor speech HTML",
    subtitle: "Overnight call rate target (around)",
  };
}

function parseSnbAssessmentText(text: string, href: string): { value: number; hold: boolean; snippet: string } {
  const hold = text.match(/SNB policy rate unchanged at\s+(-?[0-9.]+)\s*%/i);
  const move = text.match(
    /(?:raises|lowers|increases|cuts|leaving|sets)\s+(?:the\s+)?SNB policy rate(?:\s+\w+){0,6}\s+(?:to|at)\s+(-?[0-9.]+)\s*%/i,
  );
  const raw = hold?.[1] ?? move?.[1];
  if (raw == null) {
    fail("SNB assessment", `page ${href} had no 'SNB policy rate … at/to X%' sentence`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < -2 || value > 5) {
    fail("SNB assessment", `implausible rate ${raw}`);
  }
  return { value, hold: Boolean(hold), snippet: (hold ?? move)?.[0] ?? "" };
}

export async function scrapeSnbPolicyRate(): Promise<ScrapedRate> {
  const list = await timedFetchHtml(SNB_DECISIONS);
  if (!list.ok) fail("SNB decisions", list.error);

  const items = [
    ...list.html.matchAll(
      /<a class="m-mixed-list-item[^"]*" href="([^"]+)"[\s\S]*?Monetary policy assessment of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*<\/span>/gi,
    ),
  ]
    .map((m) => ({
      href: m[1]!.startsWith("http") ? m[1]! : `https://www.snb.ch${m[1]}`,
      asOf: parseMonthDayYear(m[2]!),
      rawDate: m[2]!,
    }))
    .filter((it) => it.asOf);

  const unique: typeof items = [];
  for (const it of items) {
    if (!unique.some((u) => u.asOf === it.asOf)) unique.push(it);
  }
  if (!unique.length) fail("SNB decisions", "no latest 'Monetary policy assessment of …' link");

  const latest = unique[0]!;
  const previous = unique[1];
  const page = await timedFetchHtml(latest.href);
  if (!page.ok) fail("SNB assessment", page.error);
  const parsed = parseSnbAssessmentText(stripTags(page.html), latest.href);

  let changeBps = 0;
  if (previous) {
    const prevPage = await timedFetchHtml(previous.href);
    if (prevPage.ok) {
      const prevParsed = parseSnbAssessmentText(stripTags(prevPage.html), previous.href);
      changeBps = Math.round((parsed.value - prevParsed.value) * 100);
    } else if (!parsed.hold) {
      fail("SNB assessment", `could not fetch previous assessment ${previous.href}`);
    }
  } else if (!parsed.hold) {
    fail("SNB decisions", "need previous quarterly assessment to measure a rate change");
  }

  console.log(
    `[POLICY][scrape][snb] ${latest.href} snippet=${JSON.stringify(parsed.snippet)} rate=${parsed.value} vsPrev=${previous?.asOf ?? "—"} bps=${changeBps}`,
  );
  return {
    value: parsed.value,
    asOf: latest.asOf!,
    applicableFrom: latest.asOf!,
    changeBps,
    lastDateIso: latest.asOf!,
    sourceUrl: latest.href,
    label: "SNB monetary policy assessment HTML",
  };
}

export async function scrapeTcmbOneWeekRepo(): Promise<ScrapedRate> {
  const key = process.env.TCMB_API_KEY?.trim();
  if (key) {
    try {
      const start = "01-01-2024";
      const [y, m, d] = utcTodayIso().split("-");
      const end = `${d}-${m}-${y}`;
      const url = `https://evds2.tcmb.gov.tr/service/evds/series=TP.EF.POLITIKA&startDate=${start}&endDate=${end}&type=json`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(url, { headers: { key, Accept: "application/json" }, signal: ctrl.signal }).finally(() =>
        clearTimeout(t),
      );
      if (res.ok) {
        const json = (await res.json()) as { items?: Array<Record<string, string>> };
        const items = json.items ?? [];
        const points = items
          .map((it) => {
            const dateRaw = String(it.Tarih ?? it.Date ?? "");
            const iso = parseMonthDayYear(dateRaw.replace(/\./g, ".")) ?? dateRaw.slice(0, 10);
            const val = Number(Object.values(it).find((v) => v && /^\d+(\.\d+)?$/.test(String(v))));
            return { date: iso, value: val };
          })
          .filter((p) => p.date && Number.isFinite(p.value));
        if (points.length) {
          const last = points[points.length - 1]!;
          if (Number.isFinite(last.value) && last.value >= 0 && last.value <= 80) {
            console.log(`[POLICY][scrape][tcmb] EVDS ok asOf=${last.date} rate=${last.value}`);
            return {
              value: last.value,
              asOf: last.date,
              applicableFrom: last.date,
              changeBps: 0,
              lastDateIso: last.date,
              sourceUrl: url,
              label: "TCMB EVDS (optional TCMB_API_KEY)",
              subtitle: "1W repo",
            };
          }
          console.warn(`[POLICY][scrape][tcmb] EVDS value ${last.value} implausible — HTML table`);
        }
      }
      console.warn(`[POLICY][scrape][tcmb] EVDS unavailable HTTP ${res.status} — falling back to official HTML table`);
    } catch (e) {
      console.warn(`[POLICY][scrape][tcmb] EVDS error ${e instanceof Error ? e.message : e} — falling back to HTML table`);
    }
  } else {
    console.log("[POLICY][scrape][tcmb] TCMB_API_KEY not set — using official 1 Week Repo HTML table");
  }

  const page = await timedFetchHtml(TCMB_REPO);
  if (!page.ok) fail("TCMB 1W repo table", page.error);
  const rows = [
    ...page.html.matchAll(
      /<tr[^>]*>[\s\S]*?<td[^>]*>\s*(\d{2}\.\d{2}\.\d{4})\s*<\/td>[\s\S]*?<td[^>]*>\s*([^<]*)<\/td>[\s\S]*?<td[^>]*>\s*([0-9.,]+)\s*<\/td>/gi,
    ),
  ];
  if (rows.length < 2) fail("TCMB 1W repo table", "expected dated lending-rate rows");
  const points = rows.map((r) => ({
    date: parseMonthDayYear(r[1]!)!,
    value: Number(r[3]!.replace(",", ".")),
  }));
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  if (!last?.date || !Number.isFinite(last.value)) fail("TCMB 1W repo table", "could not parse last lending rate");
  const changeBps = (last.value - prev.value) * 100;
  console.log(
    `[POLICY][scrape][tcmb] table last=${last.date} ${last.value} prev=${prev.date} ${prev.value} snippet=${rows[rows.length - 1]?.[0]?.replace(/\s+/g, " ").slice(0, 160)}`,
  );
  return {
    value: last.value,
    asOf: last.date,
    applicableFrom: last.date,
    changeBps,
    lastDateIso: last.date,
    sourceUrl: TCMB_REPO,
    label: "TCMB 1 Week Repo HTML table",
    subtitle: "1W repo",
    points,
  };
}

export async function scrapeChinaLpr(): Promise<ScrapedRate> {
  const page = await timedFetchHtml(CHINA_LPR);
  if (!page.ok) fail("China LPR API", page.error);
  let json: { records?: Array<{ "1Y"?: string; showDateCN?: string }> };
  try {
    json = JSON.parse(page.html) as typeof json;
  } catch {
    fail("China LPR API", "response was not JSON — page structure may have changed");
  }
  const recs = json.records ?? [];
  if (recs.length < 2) fail("China LPR API", "expected at least two LPR history rows");
  const latest = recs[0]!;
  const prev = recs[1]!;
  const value = Number(latest["1Y"]);
  const prevVal = Number(prev["1Y"]);
  if (!Number.isFinite(value)) fail("China LPR API", "missing 1Y on latest row");
  const asOf = latest.showDateCN;
  if (!asOf) fail("China LPR API", "missing showDateCN");
  console.log(`[POLICY][scrape][china-lpr] asOf=${asOf} 1Y=${value} prev=${prevVal}`);
  return {
    value,
    asOf,
    applicableFrom: asOf,
    changeBps: Number.isFinite(prevVal) ? (value - prevVal) * 100 : 0,
    lastDateIso: asOf,
    sourceUrl: "https://www.chinamoney.com.cn/english/bmklpr/",
    label: "ChinaMoney LprHis JSON",
    subtitle: "1Y LPR",
  };
}
