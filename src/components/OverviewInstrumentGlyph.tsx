import { useId } from "react";

const SVG_OUTER =
  "h-[17px] w-[17px] shrink-0 translate-y-px rounded-full shadow-[0_0_0_1px_rgba(148,163,184,0.22)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]";

type GlyphKind = "us" | "se" | "eu" | "au" | "oil" | "risk";

function kindForLabel(label: string): GlyphKind {
  if (label === "VIX Index" || label === "SKEW Index" || label === "Fear & Greed Index") return "risk";
  if (label === "OMX Stockholm 30" || label === "Sweden 10Y Yield" || label === "Sweden 2Y Yield") return "se";
  if (label === "EUR/SEK") return "eu";
  if (label === "Gold Spot") return "au";
  if (label === "Brent Crude") return "oil";
  return "us";
}

/** Small circular asset glyph for overview cards — SVG only, no emoji or text pills. */
export function OverviewInstrumentGlyph({ label }: { label: string }) {
  const kind = kindForLabel(label);
  switch (kind) {
    case "se":
      return <GlyphSweden />;
    case "eu":
      return <GlyphEU />;
    case "risk":
      return <GlyphRisk />;
    case "au":
      return <GlyphGold />;
    case "oil":
      return <GlyphOil />;
    default:
      return <GlyphUS />;
  }
}

function GlyphUS() {
  const uid = useId().replace(/:/g, "");
  const clipId = `og-us-${uid}`;
  const stripH = 20 / 13;
  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {Array.from({ length: 13 }, (_, i) => (
          <rect
            key={i}
            x={0}
            y={i * stripH}
            width={20}
            height={stripH + 0.02}
            fill={i % 2 === 0 ? "#BF0A30" : "#FFFFFF"}
          />
        ))}
        <rect x={0} y={0} width={8} height={(7 / 13) * 20} fill="#002868" />
      </g>
    </svg>
  );
}

function GlyphSweden() {
  const uid = useId().replace(/:/g, "");
  const clipId = `og-se-${uid}`;
  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#006AA7" />
        <rect x={7} y={0} width={6} height={20} fill="#FFCD00" />
        <rect x={0} y={7} width={20} height={6} fill="#FFCD00" />
      </g>
    </svg>
  );
}

function GlyphEU() {
  const uid = useId().replace(/:/g, "");
  const clipId = `og-eu-${uid}`;
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const cx = 10 + 5.2 * Math.cos(angle);
    const cy = 10 + 5.2 * Math.sin(angle);
    return (
      <polygon
        key={i}
        fill="#FFCC00"
        points={`${cx},${cy - 0.9} ${cx + 0.28},${cy - 0.28} ${cx + 0.9},${cy - 0.28} ${cx + 0.38},${cy + 0.12} ${cx + 0.58},${cy + 0.82} ${cx},${cy + 0.42} ${cx - 0.58},${cy + 0.82} ${cx - 0.38},${cy + 0.12} ${cx - 0.9},${cy - 0.28} ${cx - 0.28},${cy - 0.28}`}
      />
    );
  });

  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#003399" />
        {stars}
      </g>
    </svg>
  );
}

function GlyphRisk() {
  const uid = useId().replace(/:/g, "");
  const gid = `og-risk-bg-${uid}`;
  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e2f4d" />
          <stop offset="58%" stopColor="#27436e" />
          <stop offset="100%" stopColor="#1a355b" />
        </linearGradient>
      </defs>
      <circle cx={10} cy={10} r={10} fill={`url(#${gid})`} />
      <circle cx={10} cy={10} r={9.2} fill="none" stroke="rgba(226,232,240,0.52)" strokeWidth={0.95} />
      {/* Gauge icon: conveys volatility / risk without country flag semantics. */}
      <path
        d="M5 12.4a5 5 0 0 1 10 0"
        fill="none"
        stroke="rgba(226,232,240,0.92)"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <path
        d="M10 12.2 L13.4 9.1"
        fill="none"
        stroke="rgb(251 191 36)"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <circle cx={10} cy={12.2} r={1.2} fill="rgb(226 232 240)" />
    </svg>
  );
}

function GlyphGold() {
  const uid = useId().replace(/:/g, "");
  const gid = `og-gold-${uid}`;
  const clipId = `og-gold-clip-${uid}`;
  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff7e2" />
          <stop offset="55%" stopColor="#f2d49a" />
          <stop offset="100%" stopColor="#c49a4a" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle cx={10} cy={10} r={10} fill={`url(#${gid})`} />
        {/* Flat, 2D badge border for legibility on light/dark backgrounds */}
        <circle cx={10} cy={10} r={9.25} fill="none" stroke="rgba(15,23,42,0.22)" strokeWidth={0.9} />
      </g>
    </svg>
  );
}

function GlyphOil() {
  const uid = useId().replace(/:/g, "");
  const clipId = `og-oil-${uid}`;
  return (
    <svg className={SVG_OUTER} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#1c1917" />
        <path
          fill="#64748b"
          d="M10 4.2c-1.9 0-3.3 1.45-3.3 3.15 0 1.35.75 2.5 1.85 3.15L10 16l1.45-5.5c1.1-.65 1.85-1.8 1.85-3.15C13.3 5.65 11.9 4.2 10 4.2z"
        />
        <ellipse cx={10} cy={6.15} rx={1.15} ry={0.85} fill="#94a3b8" fillOpacity={0.55} />
      </g>
    </svg>
  );
}
