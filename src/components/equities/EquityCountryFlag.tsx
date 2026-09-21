import { useId } from "react";

const FLAG_SIZES = {
  xs: "h-[12px] w-[12px]",
  sm: "h-[16px] w-[16px]",
  md: "h-[22px] w-[22px]",
} as const;

function Clip({
  id,
  children,
  size = "sm",
}: {
  id: string;
  children: React.ReactNode;
  size?: keyof typeof FLAG_SIZES;
}) {
  const flagClass = `${FLAG_SIZES[size]} shrink-0 rounded-full shadow-[0_0_0_1px_rgba(148,163,184,0.25)] ring-1 ring-black/[0.04]`;
  return (
    <svg className={flagClass} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <clipPath id={id}>
          <circle cx={10} cy={10} r={10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </svg>
  );
}

function FlagUS() {
  const id = useId().replace(/:/g, "");
  const h = 20 / 13;
  return (
    <Clip id={id}>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={0} y={i * h} width={20} height={h + 0.02} fill={i % 2 ? "#fff" : "#BF0A30"} />
      ))}
      <rect x={0} y={0} width={8} height={(7 / 13) * 20} fill="#002868" />
    </Clip>
  );
}

function FlagSE() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#006AA7" />
      <rect x={7} y={0} width={6} height={20} fill="#FFCD00" />
      <rect x={0} y={7} width={20} height={6} fill="#FFCD00" />
    </Clip>
  );
}

function FlagDE() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect y={0} width={20} height={6.67} fill="#000" />
      <rect y={6.67} width={20} height={6.67} fill="#DD0000" />
      <rect y={13.34} width={20} height={6.66} fill="#FFCE00" />
    </Clip>
  );
}

function FlagFR() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect x={0} width={6.67} height={20} fill="#0055A4" />
      <rect x={6.67} width={6.66} height={20} fill="#fff" />
      <rect x={13.33} width={6.67} height={20} fill="#EF4135" />
    </Clip>
  );
}

function FlagGB() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#012169" />
      <path fill="none" stroke="#fff" strokeWidth={4} d="M0 0 L20 20 M20 0 L0 20" />
      <path fill="none" stroke="#C8102E" strokeWidth={2} d="M0 0 L20 20 M20 0 L0 20" />
      <rect x={8} width={4} height={20} fill="#fff" />
      <rect y={8} width={20} height={4} fill="#fff" />
      <rect x={9} width={2} height={20} fill="#C8102E" />
      <rect y={9} width={20} height={2} fill="#C8102E" />
    </Clip>
  );
}

function FlagJP() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#fff" />
      <circle cx={10} cy={10} r={5.5} fill="#BC002D" />
    </Clip>
  );
}

function FlagCN() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#DE2910" />
      <polygon fill="#FFDE00" points="5.2,4.2 6.1,6.6 8.7,6.6 6.5,8.1 7.4,10.5 5.2,9 3,10.5 3.9,8.1 1.7,6.6 4.3,6.6" />
    </Clip>
  );
}

function FlagHK() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#DE2910" />
      <circle cx={10} cy={10} r={4.5} fill="#fff" />
      <circle cx={10} cy={10} r={3.2} fill="#DE2910" />
    </Clip>
  );
}

function FlagIN() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect y={0} width={20} height={6.67} fill="#FF9933" />
      <rect y={6.67} width={20} height={6.66} fill="#fff" />
      <rect y={13.33} width={20} height={6.67} fill="#138808" />
      <circle cx={10} cy={10} r={1.8} fill="#000080" />
    </Clip>
  );
}

function FlagKR() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#fff" />
      <circle cx={10} cy={10} r={4} fill="#C60C30" />
      <path fill="#003478" d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
    </Clip>
  );
}

function FlagAU() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#012169" />
      <rect width={10} height={10} fill="#012169" />
      <rect x={0} y={0} width={10} height={5} fill="#C8102E" />
      <rect x={0} y={5} width={10} height={5} fill="#012169" />
      <circle cx={14} cy={14} r={1.2} fill="#fff" />
    </Clip>
  );
}

function FlagCA() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect x={0} width={5} height={20} fill="#FF0000" />
      <rect x={5} width={10} height={20} fill="#fff" />
      <rect x={15} width={5} height={20} fill="#FF0000" />
      <path fill="#FF0000" d="M10 7.5 L11.2 10.5 L14.5 10.5 L11.8 12.5 L12.8 15.5 L10 13.5 L7.2 15.5 L8.2 12.5 L5.5 10.5 L8.8 10.5 Z" />
    </Clip>
  );
}

function FlagBR() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#009B3A" />
      <polygon fill="#FEDF00" points="10,3 18,10 10,17 2,10" />
      <circle cx={10} cy={10} r={3.5} fill="#002776" />
    </Clip>
  );
}

function FlagMX() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect x={0} width={6.67} height={20} fill="#006847" />
      <rect x={6.67} width={6.66} height={20} fill="#fff" />
      <rect x={13.33} width={6.67} height={20} fill="#CE1126" />
    </Clip>
  );
}

function FlagIT() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect x={0} width={6.67} height={20} fill="#009246" />
      <rect x={6.67} width={6.66} height={20} fill="#fff" />
      <rect x={13.33} width={6.67} height={20} fill="#CE2B37" />
    </Clip>
  );
}

function FlagES() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect y={0} width={20} height={5} fill="#AA151B" />
      <rect y={5} width={20} height={10} fill="#F1BF00" />
      <rect y={15} width={20} height={5} fill="#AA151B" />
    </Clip>
  );
}

function FlagNL() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect y={0} width={20} height={6.67} fill="#AE1C28" />
      <rect y={6.67} width={20} height={6.66} fill="#fff" />
      <rect y={13.33} width={20} height={6.67} fill="#21468B" />
    </Clip>
  );
}

function FlagCH() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#FF0000" />
      <rect x={8.5} y={4.5} width={3} height={11} fill="#fff" />
      <rect x={4.5} y={8.5} width={11} height={3} fill="#fff" />
    </Clip>
  );
}

function FlagNO() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#BA0C2F" />
      <rect x={5.5} y={0} width={5} height={20} fill="#fff" />
      <rect x={0} y={7.5} width={20} height={5} fill="#fff" />
      <rect x={7} y={0} width={2} height={20} fill="#00205B" />
      <rect x={0} y={8.5} width={20} height={2} fill="#00205B" />
    </Clip>
  );
}

function FlagDK() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#C8102E" />
      <rect x={5.5} y={0} width={5} height={20} fill="#fff" />
      <rect x={0} y={7.5} width={20} height={5} fill="#fff" />
    </Clip>
  );
}

function FlagFI() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#fff" />
      <rect x={5.5} y={0} width={5} height={20} fill="#003580" />
      <rect x={0} y={7.5} width={20} height={5} fill="#003580" />
    </Clip>
  );
}

function FlagZA() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect y={0} width={20} height={6.67} fill="#E03C31" />
      <rect y={6.67} width={20} height={6.66} fill="#001489" />
      <rect y={13.33} width={20} height={6.67} fill="#007749" />
      <polygon fill="#000" points="0,0 9,10 0,20" />
      <polygon fill="#FFB81C" points="0,0 7.5,10 0,20" />
    </Clip>
  );
}

function FlagTR() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#E30A17" />
      <circle cx={7.8} cy={10} r={4.2} fill="#fff" />
      <circle cx={9.1} cy={10} r={3.35} fill="#E30A17" />
      <polygon
        fill="#fff"
        points="12.8,8.2 13.35,9.45 14.65,9.45 13.55,10.2 13.95,11.55 12.8,10.75 11.65,11.55 12.05,10.2 10.95,9.45 12.25,9.45"
      />
    </Clip>
  );
}

/** European Union — overview / pan-Europe indices. */
function FlagEU() {
  const id = useId().replace(/:/g, "");
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
    <Clip id={id}>
      <rect width={20} height={20} fill="#003399" />
      {stars}
    </Clip>
  );
}

/** Generic globe — pan-regional indices (e.g. OMX Nordic 40). */
function FlagGlobe() {
  const id = useId().replace(/:/g, "");
  return (
    <Clip id={id}>
      <rect width={20} height={20} fill="#eff6ff" />
      <circle cx={10} cy={10} r={7.2} fill="#dbeafe" stroke="#64748b" strokeWidth={0.7} />
      <ellipse cx={10} cy={10} rx={2.8} ry={7} fill="none" stroke="#475569" strokeWidth={0.55} />
      <path d="M3.2 10h13.6" stroke="#475569" strokeWidth={0.55} />
      <path d="M10 3.1v13.8" stroke="#475569" strokeWidth={0.45} />
      <path
        d="M6.2 5.4c1.8 1.1 6 1.1 7.6 0M6.4 14.8c1.6-1 5.8-1 7.2 0"
        fill="none"
        stroke="#64748b"
        strokeWidth={0.45}
      />
    </Clip>
  );
}

const FLAGS: Record<string, () => React.ReactElement> = {
  US: FlagUS, SE: FlagSE, DE: FlagDE, FR: FlagFR, GB: FlagGB, JP: FlagJP, CN: FlagCN,
  HK: FlagHK, IN: FlagIN, KR: FlagKR, AU: FlagAU, CA: FlagCA, BR: FlagBR, MX: FlagMX,
  IT: FlagIT, ES: FlagES, NL: FlagNL, CH: FlagCH, NO: FlagNO, DK: FlagDK, FI: FlagFI, ZA: FlagZA,
  TR: FlagTR, EU: FlagEU, eu500: FlagEU,
  omxn40: FlagGlobe,
  nqgi: FlagGlobe,
};

export function EquityCountryFlag({
  countryId,
  size = "sm",
}: {
  countryId: string;
  size?: "xs" | "sm" | "md";
}) {
  const Flag = FLAGS[countryId];
  if (!Flag) return null;
  const wrap =
    size === "md"
      ? "inline-flex shrink-0 [&>svg]:h-[22px] [&>svg]:w-[22px]"
      : size === "xs"
        ? "inline-flex shrink-0 [&>svg]:h-[12px] [&>svg]:w-[12px]"
        : "inline-flex shrink-0";
  return (
    <span className={wrap}>
      <Flag />
    </span>
  );
}
