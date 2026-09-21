export type OccContract = {
  root: string;
  expiry: string;
  type: "C" | "P";
  strike: number;
};

const OCC_RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;

/** Parse an OCC option symbol such as SPX260923C07675000 or SPXW260923P07675000. */
export function parseOccOptionSymbol(symbol: string): OccContract | null {
  const m = symbol.trim().toUpperCase().match(OCC_RE);
  if (!m) return null;
  const yymmdd = m[2]!;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const expiry = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return {
    root: m[1]!,
    expiry,
    type: m[3] as "C" | "P",
    strike: Number(m[4]) / 1000,
  };
}
