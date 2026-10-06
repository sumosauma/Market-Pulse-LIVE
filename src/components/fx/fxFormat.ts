export function fmtPct(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function fmtBps(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n > 0) return `+${abs} bps`;
  if (n < 0) return `−${abs} bps`;
  return "0 bps";
}

export function fmtCorr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return "0.00";
}

export function fmtVol(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function ordinal(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const value = Math.round(n);
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}

export function fmtContracts(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtRate(n: number | null, digits: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Restrained strength/weakness wash. Zero and missing values stay unfilled. */
export function heatBackground(pct: number | null, scale = 4): string | undefined {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return undefined;
  const intensity = Math.min(Math.abs(pct) / scale, 1);
  const alpha = (0.08 + intensity * 0.16).toFixed(3);
  return pct > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
}
