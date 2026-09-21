import ReactMarkdown from "react-markdown";
import { Sparkline } from "./Sparkline";
import type { Quote } from "@/lib/markets.functions";

interface Section {
  title: string;
  body: string;
}

const LABELS: Record<string, string> = {
  Rates: "RATES",
  Equities: "EQUITIES",
  "Inflation & Commodities": "INFLATION · COMMODITIES",
  Forex: "FX",
  Volatility: "VOLATILITY",
  "Top news": "TOP NEWS",
  "The big picture": "BIG PICTURE",
};

function parseSections(md: string): Section[] {
  const cleaned = md.replace(/^---\s*$/gm, "").trim();
  const parts = cleaned.split(/^##\s+/m).filter(Boolean);
  return parts.map((p) => {
    const [first, ...rest] = p.split("\n");
    return { title: first.trim(), body: rest.join("\n").trim() };
  });
}

interface BulletLine {
  label: string | null;
  rest: string;
}

function parseBullets(body: string): { bullets: BulletLine[]; trailing: string } {
  const lines = body.split("\n");
  const bullets: BulletLine[] = [];
  const trailing: string[] = [];
  let inBullets = true;
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m && inBullets) {
      const content = m[1];
      const lab = content.match(/^\*\*([^*]+?):?\*\*\s*[:\s]*\s*(.*)$/);
      if (lab) bullets.push({ label: lab[1].trim(), rest: lab[2].trim() });
      else bullets.push({ label: null, rest: content });
    } else if (line.trim() === "" && inBullets) {
      // skip
    } else {
      inBullets = false;
      trailing.push(line);
    }
  }
  return { bullets, trailing: trailing.join("\n").trim() };
}

function findQuote(quotes: Quote[], label: string): Quote | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(label);
  let q = quotes.find((x) => norm(x.label) === target);
  if (q) return q;
  return quotes.find((x) => norm(x.label).includes(target) || target.includes(norm(x.label)));
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-foreground">
          {title}
        </h3>
        {meta && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function SegmentCard({ section, quotes }: { section: Section; quotes: Quote[] }) {
  const { bullets, trailing } = parseBullets(section.body);
  return (
    <Panel title={LABELS[section.title] ?? section.title.toUpperCase()}>
      {bullets.length > 0 ? (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => {
            const q = b.label ? findQuote(quotes, b.label) : undefined;
            const series = q?.history?.map((h) => h.price) ?? [];
            return (
              <li key={i} className="flex items-start gap-3 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground">
                  {b.label && (
                    <span className="font-semibold text-foreground/95">{b.label}: </span>
                  )}
                  <span className="font-mono tabular-nums text-foreground/90">{b.rest}</span>
                </div>
                {series.length >= 2 && (
                  <Sparkline values={series} className="mt-0.5 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="prose prose-sm max-w-none text-[12.5px] leading-snug text-foreground prose-p:my-1">
          <ReactMarkdown>{section.body}</ReactMarkdown>
        </div>
      )}
      {trailing && (
        <div className="mt-2 border-t border-border/60 pt-2 text-[11.5px] italic text-muted-foreground">
          <ReactMarkdown>{trailing}</ReactMarkdown>
        </div>
      )}
    </Panel>
  );
}

function NewsCard({ section }: { section: Section }) {
  return (
    <Panel title="TOP NEWS" meta="3 most relevant">
      <div className="prose prose-sm max-w-none text-[12.5px] leading-snug text-foreground prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary">
        <ReactMarkdown>{section.body}</ReactMarkdown>
      </div>
    </Panel>
  );
}

function BigPictureCard({ section }: { section: Section }) {
  return (
    <Panel title="BIG PICTURE" meta="cross-asset narrative">
      <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground prose-p:my-1.5 prose-strong:text-foreground">
        <ReactMarkdown>{section.body}</ReactMarkdown>
      </div>
    </Panel>
  );
}

export function AnalysisBriefing({
  markdown,
  quotes,
}: {
  markdown: string;
  quotes: Quote[];
}) {
  const sections = parseSections(markdown);
  const segments = sections.filter(
    (s) => s.title !== "Top news" && s.title !== "The big picture",
  );
  const news = sections.find((s) => s.title === "Top news");
  const bigPicture = sections.find((s) => s.title === "The big picture");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {segments.map((s) => (
          <SegmentCard key={s.title} section={s} quotes={quotes} />
        ))}
      </div>
      {news && <NewsCard section={news} />}
      {bigPicture && <BigPictureCard section={bigPicture} />}
    </div>
  );
}
