import { mapSparklineColor } from "@/lib/equities/equityMapStyle";

/** Deterministic pseudo-sparkline — ready to swap for live series later. */
function sparkPoints(
  countryId: string,
  changePercent: number | null,
  w = 44,
  h = 22,
): string {
  let seed = 0;
  for (let i = 0; i < countryId.length; i++) seed += countryId.charCodeAt(i) * (i + 1);

  const n = 10;
  const pad = 2;
  const bias =
    changePercent === null || !Number.isFinite(changePercent)
      ? 0
      : changePercent > 0.05
        ? -0.35
        : changePercent < -0.05
          ? 0.35
          : 0;

  const ys: number[] = [];
  let y = h / 2;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((seed % 100) / 100 - 0.5) * 4;
    y += noise + bias;
    y = Math.max(pad, Math.min(h - pad, y));
    ys.push(y);
  }

  const step = (w - pad * 2) / (n - 1);
  return ys
    .map((yy, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${yy.toFixed(1)}`)
    .join(" ");
}

export function EquitySparkline({
  countryId,
  changePercent,
  compact,
  tiny,
}: {
  countryId: string;
  changePercent: number | null;
  compact?: boolean;
  tiny?: boolean;
}) {
  const color = mapSparklineColor(changePercent);
  const w = tiny ? 24 : compact ? 34 : 44;
  const h = tiny ? 11 : compact ? 16 : 22;
  const d = sparkPoints(countryId, changePercent, w, h);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="shrink-0"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={tiny ? 0.9 : compact ? 1 : 1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
