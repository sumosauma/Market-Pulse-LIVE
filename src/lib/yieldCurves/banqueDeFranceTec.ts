import type { ParsedFranceTecHistory, YieldMaturity } from "./types";

/**
 * Banque de France / Euronext TEC constant-maturity OAT yields.
 * The history file is a Webstat column export linked from the indices obligataires page.
 * Monthly T-bill auction averages (TMB) and euro-area curves are not used.
 */
const LISTING_URL = "https://www.banque-france.fr/fr/statistiques/taux-et-cours";
const LOOKBACK_DAYS = 450;
const PAGE_HEADERS = {
  Accept: "text/html,text/csv,*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const TEC_MATURITY: Record<string, YieldMaturity> = {
  "1": "1Y",
  "2": "2Y",
  "5": "5Y",
  "10": "10Y",
  "30": "30Y",
};

const OFFICIAL_TENORS: readonly YieldMaturity[] = ["1Y", "2Y", "5Y", "10Y", "30Y"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function recentIndexPages(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(
      `https://www.banque-france.fr/fr/statistiques/taux-et-cours/indices-obligataires-${d.toISOString().slice(0, 10)}`,
    );
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function toAbsolute(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return new URL(href, "https://www.banque-france.fr").toString();
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: PAGE_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function isBanqueDeFranceTecCsv(csv: string): boolean {
  return /FRMOYTEC1(?:\D|$)/.test(csv) && csv.includes("FRMOYTEC10") && csv.includes("FRMOYTEC30");
}

function extractExportUrls(html: string): string[] {
  const found = new Set<string>();
  const re = /(?:https?:)?\/\/webstat\.banque-france\.fr\/export\/csv-columns\/fr\/selection\/\d+|\/export\/csv-columns\/fr\/selection\/\d+/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[0].startsWith("http") ? match[0] : `https://webstat.banque-france.fr${match[0]}`;
    found.add(raw);
  }
  return [...found];
}

function extractIndexPages(html: string): string[] {
  const found = new Set<string>();
  const re = /href="([^"]*indices-obligataires[^"]*)"/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1];
    if (href) found.add(toAbsolute(href.replace(/&amp;/g, "&")));
  }
  return [...found];
}

async function resolveTecCsv(cachedExportUrl: string | null): Promise<{ url: string; csv: string }> {
  if (cachedExportUrl) {
    const cached = await fetchText(cachedExportUrl, 30_000);
    if (cached && isBanqueDeFranceTecCsv(cached)) return { url: cachedExportUrl, csv: cached };
  }

  const pages: string[] = [];
  const listing = await fetchText(LISTING_URL, 15_000);
  if (listing) pages.push(...extractIndexPages(listing));
  for (const page of recentIndexPages(14)) {
    if (!pages.includes(page)) pages.push(page);
  }

  const seenExports = new Set<string>();
  let pagesTried = 0;
  for (const page of pages) {
    if (pagesTried >= 10) break;
    pagesTried += 1;
    const html = await fetchText(page, 12_000);
    if (!html) continue;
    for (const exportUrl of extractExportUrls(html)) {
      if (seenExports.has(exportUrl)) continue;
      seenExports.add(exportUrl);
      const csv = await fetchText(exportUrl, 30_000);
      if (csv && isBanqueDeFranceTecCsv(csv)) return { url: exportUrl, csv };
    }
  }

  throw new Error("Banque de France TEC history export could not be resolved");
}

function parseFrenchNumber(raw: string | undefined): number | null {
  const text = raw?.trim() ?? "";
  if (!text || text === "-" || text === "–" || text === ".") return null;
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value <= -2 || value > 25) return null;
  return value;
}

export function parseBanqueDeFranceTecCsv(csv: string, sourceEndpoint: string): ParsedFranceTecHistory {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines.find((line) => line.includes("FRMOYTEC10"));
  if (!header) throw new Error("TEC series codes were not in the Banque de France export");

  const headerCells = header.split(";");
  const column = new Map<YieldMaturity, number>();
  headerCells.forEach((cell, index) => {
    const match = cell.match(/FRMOYTEC(\d+)/);
    const maturity = match ? TEC_MATURITY[match[1]!] : undefined;
    if (maturity) column.set(maturity, index);
  });
  for (const maturity of OFFICIAL_TENORS) {
    if (!column.has(maturity)) throw new Error(`TEC export is missing ${maturity}`);
  }

  const values = new Map<YieldMaturity, Map<string, number>>();
  for (const maturity of OFFICIAL_TENORS) values.set(maturity, new Map());
  const cutoff = isoDaysAgo(LOOKBACK_DAYS);

  for (const line of lines) {
    if (line === header) continue;
    const cells = line.split(";");
    const date = cells[0]?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < cutoff) continue;
    for (const maturity of OFFICIAL_TENORS) {
      const map = values.get(maturity)!;
      if (map.has(date)) continue;
      const yieldPct = parseFrenchNumber(cells[column.get(maturity)!]);
      if (yieldPct != null) map.set(date, yieldPct);
    }
  }

  const failedMaturities: YieldMaturity[] = [];
  const series: ParsedFranceTecHistory["series"][number][] = [];
  for (const maturity of OFFICIAL_TENORS) {
    const rows = [...values.get(maturity)!.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, value]) => ({ date, value }));
    if (rows.length) series.push({ maturity, rows });
    else failedMaturities.push(maturity);
  }

  if (!series.some((s) => s.maturity === "10Y" && s.rows.length)) {
    throw new Error("Banque de France TEC10 series was empty");
  }

  const tenYear = series.find((s) => s.maturity === "10Y")!.rows;
  return {
    fetchedAt: new Date().toISOString(),
    sourceEndpoint,
    latestDate: tenYear[tenYear.length - 1]?.date ?? null,
    series,
    failedMaturities: failedMaturities.length ? failedMaturities : undefined,
  };
}

export async function fetchFranceTecHistory(cachedExportUrl: string | null): Promise<ParsedFranceTecHistory> {
  const { url, csv } = await resolveTecCsv(cachedExportUrl);
  return parseBanqueDeFranceTecCsv(csv, url);
}
