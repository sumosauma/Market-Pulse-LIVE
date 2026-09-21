import type { PolicyBankId, PolicyRateRow } from "@/lib/policyRates/types";
import type { FxPairDef } from "./pairs";

export type FxCarry = {
  bps: number | null;
  usedMidpoint: boolean;
  detail: string | null;
};

/** Range targets (Fed funds) use the midpoint. Splits on hyphen / en-dash / em-dash. */
export function parsePolicyRatePct(display: string | null | undefined): {
  pct: number;
  isRange: boolean;
} | null {
  if (!display) return null;
  const cleaned = display.replace(/%/g, "").trim();
  const parts = cleaned.split(/\s*[–—-]\s*/);
  const nums = parts.map((p) => Number(p.replace(",", "."))).filter((n) => Number.isFinite(n));
  if (nums.length >= 2) return { pct: (nums[0]! + nums[1]!) / 2, isRange: true };
  if (nums.length === 1) return { pct: nums[0]!, isRange: false };
  return null;
}

/** Same live/cached print the Policy Rates panel shows — never seed or unverified fallback. */
export function isLivePolicyRateForCarry(row: PolicyRateRow | undefined): boolean {
  if (!row?.rateDisplay) return false;
  if (row.freshness === "unverified" || row.needsVerification) return false;
  return row.freshness === "live" || row.freshness === "cached";
}

export function carryForPair(
  pair: Pick<FxPairDef, "baseBank" | "quoteBank">,
  rowsByBank: ReadonlyMap<PolicyBankId, PolicyRateRow>,
): FxCarry {
  const base = rowsByBank.get(pair.baseBank);
  const quote = rowsByBank.get(pair.quoteBank);
  if (!isLivePolicyRateForCarry(base) || !isLivePolicyRateForCarry(quote)) {
    return { bps: null, usedMidpoint: false, detail: null };
  }
  const basePct = parsePolicyRatePct(base!.rateDisplay);
  const quotePct = parsePolicyRatePct(quote!.rateDisplay);
  if (!basePct || !quotePct) return { bps: null, usedMidpoint: false, detail: null };

  const usedMidpoint = basePct.isRange || quotePct.isRange;
  const baseLabel = `${base!.bankShort} ${base!.rateDisplay}${basePct.isRange ? " midpoint" : ""}`;
  const quoteLabel = `${quote!.bankShort} ${quote!.rateDisplay}${quotePct.isRange ? " midpoint" : ""}`;
  return {
    bps: (basePct.pct - quotePct.pct) * 100,
    usedMidpoint,
    detail: `${baseLabel} − ${quoteLabel}`,
  };
}

export function formatCarryBps(bps: number | null): string {
  if (bps == null || !Number.isFinite(bps)) return "—";
  const rounded = Math.sign(bps) * Math.round(Math.abs(bps));
  if (rounded === 0) return "0 bps";
  const abs = Math.abs(rounded).toString();
  return rounded > 0 ? `+${abs} bps` : `−${abs} bps`;
}

export function carryToneClass(bps: number | null): string {
  if (bps == null || !Number.isFinite(bps)) return "text-muted-foreground";
  if (bps > 0.5) return "text-[#22c55e]";
  if (bps < -0.5) return "text-[#ef4444]";
  return "text-[#64748b]";
}
