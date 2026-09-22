import { useId } from "react";
import type { SovereignCountryId } from "@/lib/yieldCurves/types";

/** Matches overview / data page instrument glyphs — circular SVG flags. */
export const SOVEREIGN_FLAG_SVG_CLASS =
  "h-[17px] w-[17px] shrink-0 translate-y-px rounded-full shadow-[0_0_0_1px_rgba(148,163,184,0.22)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]";

function FlagUS({ className }: { className: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `sf-us-${uid}`;
  const stripH = 20 / 13;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
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

function FlagSE({ className }: { className: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `sf-se-${uid}`;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
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

function FlagNO({ className }: { className: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `sf-no-${uid}`;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#BA0C2F" />
        <rect x={5.5} y={0} width={5} height={20} fill="#FFFFFF" />
        <rect x={0} y={7.5} width={20} height={5} fill="#FFFFFF" />
        <rect x={7} y={0} width={2} height={20} fill="#00205B" />
        <rect x={0} y={8.5} width={20} height={2} fill="#00205B" />
      </g>
    </svg>
  );
}

function FlagGB({ className }: { className: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `sf-gb-${uid}`;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#012169" />
        <path
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          d="M-1 0 L21 20 M21 0 L-1 20"
        />
        <path
          fill="none"
          stroke="#C8102E"
          strokeWidth={2.2}
          d="M-1 0 L21 20 M21 0 L-1 20"
        />
        <rect x={8} y={0} width={4} height={20} fill="#FFFFFF" />
        <rect x={0} y={8} width={20} height={4} fill="#FFFFFF" />
        <rect x={9} y={0} width={2} height={20} fill="#C8102E" />
        <rect x={0} y={9} width={20} height={2} fill="#C8102E" />
      </g>
    </svg>
  );
}

function FlagCN({ className }: { className: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `sf-cn-${uid}`;
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={20} height={20} fill="#DE2910" />
        <polygon
          fill="#FFDE00"
          points="5.2,4.2 6.1,6.6 8.7,6.6 6.5,8.1 7.4,10.5 5.2,9 3,10.5 3.9,8.1 1.7,6.6 4.3,6.6"
        />
        <circle cx={11.2} cy={3.4} r={0.75} fill="#FFDE00" />
        <circle cx={12.4} cy={5.1} r={0.75} fill="#FFDE00" />
        <circle cx={12.4} cy={7.2} r={0.75} fill="#FFDE00" />
        <circle cx={11.2} cy={8.9} r={0.75} fill="#FFDE00" />
      </g>
    </svg>
  );
}

/** Circular SVG country flag — same style as overview / data page glyphs. */
export function SovereignCountryFlag({
  countryId,
  className = SOVEREIGN_FLAG_SVG_CLASS,
}: {
  countryId: SovereignCountryId;
  className?: string;
}) {
  switch (countryId) {
    case "SE":
      return <FlagSE className={className} />;
    case "NO":
      return <FlagNO className={className} />;
    case "GB":
      return <FlagGB className={className} />;
    case "CN":
      return <FlagCN className={className} />;
    default:
      return <FlagUS className={className} />;
  }
}

export function CountryIdentityLine({
  countryId,
  label,
}: {
  countryId: SovereignCountryId;
  label: string;
}) {
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
      <SovereignCountryFlag countryId={countryId} />
      <span>{label}</span>
    </p>
  );
}

export function CountryPairLine({
  primaryCountryId,
  primaryLabel,
  compareCountryId,
  compareLabel,
}: {
  primaryCountryId: SovereignCountryId;
  primaryLabel: string;
  compareCountryId: SovereignCountryId;
  compareLabel: string;
}) {
  return (
    <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium text-foreground">
      <SovereignCountryFlag countryId={primaryCountryId} />
      <span>{primaryLabel}</span>
      <span className="text-foreground/80">vs</span>
      <SovereignCountryFlag countryId={compareCountryId} />
      <span>{compareLabel}</span>
    </p>
  );
}
