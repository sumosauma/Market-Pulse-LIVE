/** Public RSS fetch + parse (headlines, links, dates only — no article scraping). */

export const RSS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export interface RssHeadline {
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string | null;
  /** 1-based position in RSS XML order (editorial priority). */
  feedPosition: number;
}

export function decodeXmlText(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("<![CDATA[")) {
    t = t.slice(9);
    if (t.endsWith("]]>")) t = t.slice(0, -3);
  }
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function tagContent(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXmlText(m[1]) : null;
}

function itemLink(block: string): string | null {
  const link = tagContent(block, "link");
  if (link && /^https?:\/\//i.test(link)) return link;
  const guid = tagContent(block, "guid");
  if (guid && /^https?:\/\//i.test(guid)) return guid;
  return null;
}

function itemPublishedAt(block: string): string | null {
  const raw = tagContent(block, "pubDate") ?? tagContent(block, "dc:date");
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function itemSnippet(block: string): string | null {
  const raw =
    tagContent(block, "description") ??
    tagContent(block, "summary") ??
    tagContent(block, "content:encoded");
  if (!raw) return null;
  const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  return plain.length > 280 ? `${plain.slice(0, 277)}…` : plain;
}

export function parseRssItems(xml: string, limit: number): RssHeadline[] {
  const items: RssHeadline[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  let feedPosition = 0;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[0];
    const title = tagContent(block, "title");
    const url = itemLink(block);
    if (!title || !url) continue;
    feedPosition += 1;
    items.push({
      title,
      url,
      publishedAt: itemPublishedAt(block),
      snippet: itemSnippet(block),
      feedPosition,
    });
  }
  return items;
}

export type FetchRssResult =
  | { ok: true; items: RssHeadline[] }
  | { ok: false; items: RssHeadline[]; error: string };

export async function fetchRssFeed(url: string, limit: number): Promise<FetchRssResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": RSS_USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      return { ok: false, items: [], error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const items = parseRssItems(xml, limit);
    if (items.length === 0) {
      return { ok: false, items: [], error: "No valid items in feed" };
    }
    return { ok: true, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return { ok: false, items: [], error: msg };
  }
}
