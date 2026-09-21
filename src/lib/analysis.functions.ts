import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import type { Quote } from "./markets.functions";
import { fetchRssFeed } from "./rss";

interface AnalyzeInput {
  quotes: Quote[];
}

interface Headline {
  source: string;
  title: string;
}

async function fetchHeadlines(): Promise<Headline[]> {
  const sources: Array<[string, string]> = [
    ["https://feeds.bloomberg.com/markets/news.rss", "Bloomberg"],
    ["https://www.ft.com/rss/home", "Financial Times"],
    ["https://www.di.se/rss", "Dagens Industri"],
  ];
  const results = await Promise.all(
    sources.map(async ([url, source]) => {
      const result = await fetchRssFeed(url, 8);
      if (!result.ok) {
        console.warn(`[morning-brief] ${source} RSS failed: ${result.error}`);
        return [] as Headline[];
      }
      return result.items.map((item) => ({ source, title: item.title }));
    }),
  );
  return results.flat();
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return n >= 0 ? `+${s}` : s;
}

function quoteFacts(q: Quote): string {
  const isPct = q.unit === "%";
  const isYield = isPct && (q.category === "Rates" || q.label.includes("Breakeven"));
  const today =
    q.changePercent !== null
      ? isYield && q.change !== null
        ? `today ${fmtSigned(q.change * 100, 1)} bps`
        : `today ${fmtSigned(q.changePercent, 2)}%`
      : "today —";
  const fiveD =
    q.changePercent5d !== null
      ? isYield && q.change5d !== null
        ? `5d ${fmtSigned(q.change5d * 100, 1)} bps`
        : `5d ${fmtSigned(q.changePercent5d, 2)}%`
      : "5d —";
  const range =
    q.range5d !== null ? `5d range ${fmtNum(q.range5d.min, 2)}–${fmtNum(q.range5d.max, 2)}` : "";
  const streak =
    q.streak !== null && q.streak !== 0
      ? `streak ${q.streak > 0 ? `${q.streak} up` : `${Math.abs(q.streak)} down`}`
      : "";
  const sessions = q.history.length ? `${q.history.length} sessions` : "no history";
  const parts = [
    `price ${fmtNum(q.price, isPct ? 3 : 2)}${q.unit ? ` ${q.unit}` : ""}`,
    today,
    fiveD,
    range,
    streak,
    sessions,
  ].filter(Boolean);
  return parts.join(" · ");
}

export const analyzeMarkets = createServerFn({ method: "POST" })
  .inputValidator((data: AnalyzeInput) => data)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { analysis: null, error: "Lovable AI not configured" };
    }

    const grouped = new Map<string, Quote[]>();
    for (const q of data.quotes) {
      if (q.price === null) continue;
      if (!grouped.has(q.category)) grouped.set(q.category, []);
      grouped.get(q.category)!.push(q);
    }
    const snapshot = Array.from(grouped.entries())
      .map(([cat, items]) => {
        const lines = items.map((q) => `  - ${q.label}: ${quoteFacts(q)}`).join("\n");
        return `${cat}:\n${lines}`;
      })
      .join("\n\n");

    const headlines = await fetchHeadlines();
    const headlinesBySource = headlines.reduce<Record<string, string[]>>((acc, h) => {
      (acc[h.source] ||= []).push(h.title);
      return acc;
    }, {});
    const headlinesText = Object.entries(headlinesBySource)
      .map(([src, titles]) => `${src}:\n${titles.map((t) => `  - ${t}`).join("\n")}`)
      .join("\n\n");

    const prompt = `You are writing a pure DATA briefing on global markets. Inside each segment: STATE THE FACTS ONLY. No reasoning, no "could be because", no narrative. Reasoning is allowed ONLY in the final "The big picture" section.

Use these EXACT markdown headers and structure. One bullet per instrument. Skip an instrument entirely if its data is missing — never invent numbers.

Bullet format (one line each):
- **<Instrument>:** <price+unit> · today <move> · 5d <move> · <optional extra fact like 'highest of 5 sessions', 'flat 4 sessions then jumped', '3rd day down in a row', 'stuck in X–Y range'>.

Rules for facts:
- Yields → use "bps" for moves (e.g. "today +6 bps", "5d −12 bps").
- Equities, FX, commodities → use "%".
- Volatility → use raw point change (e.g. "VIX +0.4").
- If today's move is between −0.05% and +0.05%, write "flat today".
- If 5d move is between −0.1% and +0.1%, write "flat 5d".
- Mention "highest/lowest of 5 sessions" only if today's price equals the 5d max/min.
- Mention streak only if it's ≥3 sessions in the same direction.
- Mention "tight range" only if 5d range is unusually narrow.
- NO opinion, NO "this suggests", NO causes. Pure observation.

STRUCTURE:

## Rates
One bullet per US/Sweden yield instrument from the snapshot.

## Equities
One bullet per index.

## Inflation & Commodities
One bullet per: Brent, Gold, US 10Y Breakeven.

## Forex
One bullet per: DXY, USD/SEK, EUR/SEK.

## Volatility
One bullet per: VIX, SKEW, Fear & Greed.

---

## Top news
Pick the **3 most market-relevant** headlines from the feed below. For each:
- **[Source]** "Headline" — one short factual sentence on what it reports (no speculation).
Skip headlines that aren't clearly market-relevant. Don't invent headlines.

## The big picture
3–5 sentences. THIS is where you connect dots. What story do the numbers + 3 news items tell together? Where do segments agree (e.g. "yields up + dollar up + equities down = classic risk-off")? Where do they disagree? Tie in the news naturally. End with ONE open question. No verdict, no recommendation.

TOTAL LENGTH: ~250–320 words. Tight, scannable.

MARKET DATA (each instrument's price, today's move, 5-day move, range, streak, sessions of history):
${snapshot}

LATEST HEADLINES (raw — pick the 3 most relevant, ignore the rest):
${headlinesText || "(no headlines available right now)"}`;

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-3-flash-preview");
      const { text } = await generateText({ model, prompt });
      return { analysis: text, headlines, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      return { analysis: null, headlines, error: msg };
    }
  });
