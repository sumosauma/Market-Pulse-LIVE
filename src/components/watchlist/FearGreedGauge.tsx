export type FearGreedZoneId =
  | "extreme-fear"
  | "fear"
  | "neutral"
  | "greed"
  | "extreme-greed";

export const FEAR_GREED_ZONES: ReadonlyArray<{
  id: FearGreedZoneId;
  min: number;
  max: number;
  label: string;
  shortLabel: string;
  activeFill: string;
  activeText: string;
}> = [
  {
    id: "extreme-fear",
    min: 0,
    max: 25,
    label: "Extreme Fear",
    shortLabel: "Extreme Fear",
    activeFill: "rgba(185, 28, 28, 0.34)",
    activeText: "rgba(185, 28, 28, 0.88)",
  },
  {
    id: "fear",
    min: 25,
    max: 45,
    label: "Fear",
    shortLabel: "Fear",
    activeFill: "rgba(220, 38, 38, 0.28)",
    activeText: "rgba(220, 38, 38, 0.85)",
  },
  {
    id: "neutral",
    min: 45,
    max: 55,
    label: "Neutral",
    shortLabel: "Neutral",
    activeFill: "rgba(113, 113, 122, 0.3)",
    activeText: "rgba(82, 82, 91, 0.92)",
  },
  {
    id: "greed",
    min: 55,
    max: 75,
    label: "Greed",
    shortLabel: "Greed",
    activeFill: "rgba(13, 148, 136, 0.32)",
    activeText: "rgba(13, 148, 136, 0.9)",
  },
  {
    id: "extreme-greed",
    min: 75,
    max: 100,
    label: "Extreme Greed",
    shortLabel: "Extreme Greed",
    activeFill: "rgba(5, 150, 105, 0.32)",
    activeText: "rgba(5, 150, 105, 0.9)",
  },
];

const INACTIVE_FILL = "rgba(161, 161, 170, 0.2)";
/** CNN scale labels — placed at segment edges via zone-aware mapping. */
const SCALE_MAJOR = [0, 25, 45, 55, 75, 100] as const;

const G = {
  w: 300,
  pad: 6,
  top: 6,
  bandH: 30,
  radius: 7,
  scaleGap: 10,
  scaleLabelGap: 8,
} as const;

const barLeft = G.pad;
const barRight = G.w - G.pad;
const barW = barRight - barLeft;
const segW = barW / FEAR_GREED_ZONES.length;
const bandBottom = G.top + G.bandH;
const scaleY = bandBottom + G.scaleGap;
const scaleLabelY = scaleY + G.scaleLabelGap;

/** Map CNN Fear & Greed score (0–100) to zone metadata. */
export function fearGreedZoneForValue(value: number): (typeof FEAR_GREED_ZONES)[number] {
  const v = Math.max(0, Math.min(100, value));
  if (v < 25) return FEAR_GREED_ZONES[0];
  if (v < 45) return FEAR_GREED_ZONES[1];
  if (v < 55) return FEAR_GREED_ZONES[2];
  if (v < 75) return FEAR_GREED_ZONES[3];
  return FEAR_GREED_ZONES[4];
}

function zoneIndexForValue(value: number): number {
  return FEAR_GREED_ZONES.findIndex((z) => z.id === fearGreedZoneForValue(value).id);
}

function clampValue(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function segmentLeft(index: number): number {
  return barLeft + index * segW;
}

function segmentCenter(index: number): number {
  return segmentLeft(index) + segW / 2;
}

/**
 * Map CNN score → gauge X.
 * Five equal visual bands; position within each band reflects where the score
 * sits inside that zone's CNN range (not linear 0–100 across the bar).
 */
export function fearGreedScoreToGaugeX(score: number): number {
  const value = clampValue(score);
  const zoneIndex = zoneIndexForValue(value);
  const zone = FEAR_GREED_ZONES[zoneIndex]!;
  const span = zone.max - zone.min;
  const fraction = span > 0 ? (value - zone.min) / span : 0;
  return segmentLeft(zoneIndex) + fraction * segW;
}

function segmentPath(index: number): string {
  const x0 = segmentLeft(index);
  const x1 = x0 + segW;
  const isLeft = index === 0;
  const isRight = index === FEAR_GREED_ZONES.length - 1;

  if (isLeft) {
    return [
      `M ${barLeft + G.radius} ${G.top}`,
      `H ${x1}`,
      `V ${bandBottom}`,
      `H ${barLeft + G.radius}`,
      `Q ${barLeft} ${bandBottom} ${barLeft} ${bandBottom - G.radius}`,
      `V ${G.top + G.radius}`,
      `Q ${barLeft} ${G.top} ${barLeft + G.radius} ${G.top}`,
      "Z",
    ].join(" ");
  }

  if (isRight) {
    return [
      `M ${x0} ${G.top}`,
      `H ${barRight - G.radius}`,
      `Q ${barRight} ${G.top} ${barRight} ${G.top + G.radius}`,
      `V ${bandBottom - G.radius}`,
      `Q ${barRight} ${bandBottom} ${barRight - G.radius} ${bandBottom}`,
      `H ${x0}`,
      `V ${G.top}`,
      "Z",
    ].join(" ");
  }

  return `M ${x0} ${G.top} H ${x1} V ${bandBottom} H ${x0} Z`;
}

export function FearGreedGauge({
  value,
  height,
}: {
  value: number | null;
  height: number;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div
        className="mt-2 flex items-center justify-center rounded-sm border border-dashed border-border/60 bg-muted/15"
        style={{ height }}
      >
        <span className="text-[10px] font-medium text-muted-foreground">Unavailable</span>
      </div>
    );
  }

  const zone = fearGreedZoneForValue(value);
  const markerX = fearGreedScoreToGaugeX(value);

  return (
    <div className="mt-2 w-full min-h-0" style={{ height }}>
      <svg
        viewBox={`0 0 ${G.w} 64`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <rect
          x={barLeft}
          y={G.top}
          width={barW}
          height={G.bandH}
          rx={G.radius}
          fill="rgba(161, 161, 170, 0.12)"
          stroke="rgba(161, 161, 170, 0.28)"
          strokeWidth="0.75"
        />

        {FEAR_GREED_ZONES.map((z, index) => {
          const isActive = z.id === zone.id;
          const labelX = segmentCenter(index);
          return (
            <g key={z.id}>
              <path d={segmentPath(index)} fill={isActive ? z.activeFill : INACTIVE_FILL} />
              <text
                x={labelX}
                y={G.top + G.bandH * 0.52}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isActive ? z.activeText : "rgba(113, 113, 122, 0.72)"}
                fontSize={index === 0 || index === 4 ? 6.25 : 6.75}
                fontWeight={isActive ? 600 : 500}
                letterSpacing="0.03em"
              >
                {z.shortLabel.toUpperCase()}
              </text>
            </g>
          );
        })}

        {[1, 2, 3, 4].map((i) => (
          <line
            key={`seg-div-${i}`}
            x1={segmentLeft(i)}
            y1={G.top + 1}
            x2={segmentLeft(i)}
            y2={bandBottom - 1}
            stroke="rgba(161, 161, 170, 0.3)"
            strokeWidth="0.5"
          />
        ))}

        <line
          x1={barLeft}
          y1={scaleY}
          x2={barRight}
          y2={scaleY}
          stroke="rgba(161, 161, 170, 0.35)"
          strokeWidth="0.75"
        />

        {Array.from({ length: 21 }, (_, i) => i * 5).map((tick) => {
          const x = fearGreedScoreToGaugeX(tick);
          const major = (SCALE_MAJOR as readonly number[]).includes(tick);
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={x}
                y1={scaleY - (major ? 2.75 : 1.5)}
                x2={x}
                y2={scaleY + (major ? 2.75 : 1.5)}
                stroke={major ? "rgba(113, 113, 122, 0.55)" : "rgba(161, 161, 170, 0.38)"}
                strokeWidth={major ? 0.9 : 0.65}
              />
              {major ? (
                <text
                  x={x}
                  y={scaleLabelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(113, 113, 122, 0.78)"
                  fontSize="7.5"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="500"
                >
                  {tick}
                </text>
              ) : null}
            </g>
          );
        })}

        <line
          x1={markerX}
          y1={scaleY - 3}
          x2={markerX}
          y2={bandBottom + 0.5}
          stroke="rgba(24, 24, 27, 0.88)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx={markerX} cy={scaleY} r={2.25} fill="rgba(24, 24, 27, 0.88)" />
      </svg>
    </div>
  );
}
