/**
 * CME Daily Bulletin PDF settlements — official free publication path
 * (Clearing House advisory 24-068: Daily Bulletin remains on the web page after FTP retirement).
 *
 * Server-side fetch of published PDFs (Avanza-style), not CmeWS Settlements JSON scraping.
 * Used only as a fallback when CmeWS settlements are unavailable.
 *
 * PDF text goes through extractPdfText (runtime createRequire of pdf-parse). A static
 * import of pdf-parse is intentionally avoided — Nitro's production bundle breaks
 * pdf-parse's dynamic pdf.js require and previously disabled this entire fallback on DO.
 */
import { extractPdfText } from "./pdfText.server";

const FETCH_TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BULLETIN_PDFS = [
  "https://www.cmegroup.com/daily_bulletin/current/Section61_Energy_Futures_Products.pdf",
  "https://www.cmegroup.com/daily_bulletin/current/Section62_Metals_Futures_Products.pdf",
  "https://www.cmegroup.com/daily_bulletin/current/Section03_Agricultural_Futures.pdf",
] as const;

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export type BulletinSettlementRow = {
  year: number;
  monthIndex: number;
  price: number;
  volume: number;
  openInterest: number;
};

export type BulletinCurveStrip = {
  sessionDate: string;
  rows: BulletinSettlementRow[];
};

type ProductSpec = {
  id: string;
  /** Prefer unique product header; used for block bounds. */
  header: string;
  totalToken: string;
  digits: number;
  grain?: boolean;
};

const PRODUCTS: ProductSpec[] = [
  { id: "brent", header: "BZ FUT", totalToken: "TOTAL  BZ FUT", digits: 2 },
  { id: "wti", header: "CL FUT", totalToken: "TOTAL  CL FUT", digits: 2 },
  { id: "henry-hub", header: "NG FUT", totalToken: "TOTAL  NG FUT", digits: 3 },
  { id: "ttf", header: "TTF FUT", totalToken: "TOTAL  TTF FUT", digits: 3 },
  { id: "gold", header: "GC FUT", totalToken: "TOTAL  GC FUT", digits: 2 },
  { id: "silver", header: "SI FUT", totalToken: "TOTAL  SI FUT", digits: 3 },
  { id: "copper", header: "HG FUT", totalToken: "TOTAL  HG FUT", digits: 4 },
  { id: "aluminium", header: "ALI FUT", totalToken: "TOTAL  ALI FUT", digits: 2 },
  { id: "wheat", header: "WHEAT FUT", totalToken: "TOTAL  WHEAT FUT", digits: 2, grain: true },
  { id: "corn", header: "CORN FUT", totalToken: "TOTAL  CORN FUT", digits: 2, grain: true },
];

let inflight: Promise<Map<string, BulletinCurveStrip>> | null = null;
let memory: { savedAt: number; strips: Map<string, BulletinCurveStrip> } | null = null;
const MEMORY_MS = 10 * 60 * 1000;

function parseSessionDate(text: string): string | null {
  const m = text.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (!m) return null;
  const monthName = m[1]!.slice(0, 3).toUpperCase();
  const monthIndex = MONTHS[monthName];
  if (monthIndex == null) return null;
  const day = String(Number(m[2])).padStart(2, "0");
  return `${m[3]}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}

function parseGrainToken(tok: string): number | null {
  const m = tok.match(/^(\d+)'(\d)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 8;
  return null;
}

function extractBlock(text: string, product: ProductSpec): string {
  // Prefer header that is a product line (avoid earlier mention in indexes).
  const headerRe = new RegExp(`(?:^|\\n)${product.header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
  const headerMatch = headerRe.exec(text);
  const idx = headerMatch?.index ?? text.indexOf(product.header);
  if (idx < 0) return "";
  const from = text.slice(idx);
  const totalIdx = from.indexOf(product.totalToken);
  if (totalIdx > 0) return from.slice(0, totalIdx);
  return from.slice(0, 16_000);
}

function pushRow(
  rows: BulletinSettlementRow[],
  seen: Set<string>,
  monthTok: string,
  yy: string,
  price: number,
) {
  const monthIndex = MONTHS[monthTok];
  if (monthIndex == null) return;
  if (!Number.isFinite(price) || !(price > 0)) return;
  const year = 2000 + Number(yy);
  const key = `${year}-${monthIndex}`;
  if (seen.has(key)) return;
  seen.add(key);
  // Vol/OI are not reliably extractable from scrambled pdf-parse text — leave 0 as
  // "unavailable". Do NOT treat these as genuine zeros for keepCmeSettlementRow;
  // expired months are dropped via last-trade date rules in assembleCme.
  rows.push({ year, monthIndex, price, volume: 0, openInterest: 0 });
}

function digitPattern(digits: number): string {
  if (digits >= 4) return "\\d+\\.\\d{4}";
  if (digits === 3) return "\\d+\\.\\d{3}";
  if (digits === 1) return "\\d+\\.\\d";
  return "\\d+\\.\\d{2}";
}

/**
 * pdf-parse energy/metals layouts typically look like:
 *   JAN27 +2263281.88 82.0582.13 /79.07…
 *   DEC26 -21986089.50 3561.903676.70 /3545.40…
 *   DEC26 +101.933 91.66992.390B/91.225…
 *   MAY27 -1691.50 3637.00----130…
 */
function parseDecimalRows(block: string, digits: number): BulletinSettlementRow[] {
  const rows: BulletinSettlementRow[] = [];
  const seen = new Set<string>();
  const d = digitPattern(digits);

  // settle [high][AB]?/low — high may be glued (`90.94891.600B/`) or spaced (`91.469 92.155B/`)
  const reSlash = new RegExp(
    `\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\\d{2})\\b[^\\n]{0,60}?(${d})\\s*(?:${d})?[AB]?\\s*/\\s*[\\d.]+`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = reSlash.exec(block))) {
    pushRow(rows, seen, m[1]!, m[2]!, Number(m[3]));
  }

  // settle+high glued then B, no low slash: "79.9779.56B8602-574----" (Brent Aug/Sep)
  const reGluedB = new RegExp(
    `\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\\d{2})\\b[^\\n]{0,50}?(${d})(${d})B`,
    "g",
  );
  while ((m = reGluedB.exec(block))) {
    pushRow(rows, seen, m[1]!, m[2]!, Number(m[3]));
  }

  // settle before dashes / UNCH (no high-low): "3637.00----" or "UNCH 83.98"
  const reDash = new RegExp(
    `\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\\d{2})\\b[^\\n]{0,40}?(${d})-{2,}`,
    "g",
  );
  while ((m = reDash.exec(block))) {
    pushRow(rows, seen, m[1]!, m[2]!, Number(m[3]));
  }

  const reUnch = new RegExp(
    `\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\\d{2})\\b[^\\n]{0,40}?UNCH\\s*(${d})`,
    "g",
  );
  while ((m = reUnch.exec(block))) {
    pushRow(rows, seen, m[1]!, m[2]!, Number(m[3]));
  }

  // Clean WebFetch-style: "/low settle ±"
  const reClean =
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\b[^\n]{0,80}?\/\s*[\d.]+[AB]?\s+(\d+\.\d+)\s+(?:UNCH|[+-])/g;
  while ((m = reClean.exec(block))) {
    pushRow(rows, seen, m[1]!, m[2]!, Number(m[3]));
  }

  return rows.sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

function parseGrainRows(block: string): BulletinSettlementRow[] {
  const rows: BulletinSettlementRow[] = [];
  const seen = new Set<string>();
  // Require tick form NNN'N. Scrambled: DEC26433'4 436'0430'2434'0
  // Spaced: DEC26 433'4 436'0 430'2 434'0
  const re =
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\s*(\d+'\d)\s+(\d+'\d)[AB]?\s*\/?\s*(\d+'\d)[AB]?\s*(\d+'\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const price = parseGrainToken(m[6]!);
    // CBOT grains in USc/bu — reject garbage captures
    if (price == null || price < 50 || price > 2500) continue;
    pushRow(rows, seen, m[1]!, m[2]!, price);
  }
  return rows.sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

function parseProduct(text: string, product: ProductSpec, sessionDate: string): BulletinCurveStrip | null {
  const block = extractBlock(text, product);
  if (!block) return null;
  const rows = product.grain ? parseGrainRows(block) : parseDecimalRows(block, product.digits);
  if (rows.length < 2) return null;
  return { sessionDate, rows };
}

async function fetchPdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/pdf,*/*",
        Referer: "https://www.cmegroup.com/market-data/daily-bulletin.html",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return extractPdfText(buf);
  } catch {
    return null;
  }
}

async function loadBulletinStripsFresh(): Promise<Map<string, BulletinCurveStrip>> {
  const texts: string[] = [];
  for (const url of BULLETIN_PDFS) {
    const text = await fetchPdfText(url);
    if (text) texts.push(text);
  }
  const corpus = texts.join("\n\n");
  const out = new Map<string, BulletinCurveStrip>();
  if (!corpus) return out;

  const sessionDate = parseSessionDate(corpus);
  if (!sessionDate) return out;

  for (const product of PRODUCTS) {
    const strip = parseProduct(corpus, product, sessionDate);
    if (strip) out.set(product.id, strip);
  }
  return out;
}

/** Shared loader: one PDF trio fetch/parse per TTL window for all curves. */
export async function loadDailyBulletinStrips(): Promise<Map<string, BulletinCurveStrip>> {
  if (memory && Date.now() - memory.savedAt < MEMORY_MS) return memory.strips;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const strips = await loadBulletinStripsFresh();
      memory = { savedAt: Date.now(), strips };
      return strips;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function fetchDailyBulletinSettlements(
  curveId: string,
): Promise<{ sessionDate: string; rows: BulletinSettlementRow[] } | null> {
  const strips = await loadDailyBulletinStrips();
  const hit = strips.get(curveId);
  if (!hit || hit.rows.length < 2) return null;
  return hit;
}

/** Probe helper for diagnostics — does not cache failures. */
export async function probeDailyBulletinAccessibility(): Promise<
  Array<{ url: string; status: number; bytes: number; ctype: string | null; isPdf: boolean; ms: number }>
> {
  const out: Array<{
    url: string;
    status: number;
    bytes: number;
    ctype: string | null;
    isPdf: boolean;
    ms: number;
  }> = [];
  for (const url of BULLETIN_PDFS) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/pdf,*/*",
          Referer: "https://www.cmegroup.com/market-data/daily-bulletin.html",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      out.push({
        url,
        status: res.status,
        bytes: buf.length,
        ctype: res.headers.get("content-type"),
        isPdf: buf.slice(0, 4).toString() === "%PDF",
        ms: Date.now() - t0,
      });
    } catch {
      out.push({ url, status: 0, bytes: 0, ctype: null, isPdf: false, ms: Date.now() - t0 });
    }
  }
  return out;
}
