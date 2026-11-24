import { Boxes, Droplets, Flame, Fuel, Wheat, Zap, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import type { CommodityGroupId } from "@/lib/commodities/overview";

/**
 * Lucide misses commodity-metal glyphs.
 * Rejected: Anvil (trophy), Pickaxe (generic mining), Coins (FX), Gem (stones).
 */
export function MetalBeamIcon({ className, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M4 4h16v4H4z" />
      <path d="M10 8h4v8h-4z" />
      <path d="M4 16h16v4H4z" />
    </svg>
  );
}

export function BullionBarIcon({ className, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M4 12 7 5h10l3 7H4z" />
      <path d="M4 12h16v7H4z" />
      <path d="M7 5 4 12" />
      <path d="M17 5l3 7" />
    </svg>
  );
}

type MarkVisual = {
  icon: ComponentType<LucideProps>;
  label: string;
  markClass: string;
  iconClass: string;
};

const ENERGY: MarkVisual = {
  icon: Fuel,
  label: "Energy",
  markClass: "bg-amber-500/20 ring-amber-600/35",
  iconClass: "text-amber-900",
};

/** Brent — near-black North Sea crude. */
const BRENT: MarkVisual = {
  icon: Droplets,
  label: "Brent crude",
  markClass: "bg-neutral-950/20 ring-neutral-950/45 dark:bg-neutral-900/55 dark:ring-neutral-600/50",
  iconClass: "text-neutral-950 dark:text-neutral-200",
};

/** WTI — dark petroleum brown / crude oil. */
const WTI: MarkVisual = {
  icon: Droplets,
  label: "WTI crude",
  markClass: "bg-stone-950/22 ring-stone-950/45 dark:bg-stone-900/50 dark:ring-stone-600/45",
  iconClass: "text-stone-950 dark:text-stone-200",
};

const GAS: MarkVisual = {
  icon: Flame,
  label: "Natural gas",
  markClass: "bg-orange-500/18 ring-orange-600/30",
  iconClass: "text-orange-900",
};

const POWER: MarkVisual = {
  icon: Zap,
  label: "Power",
  markClass: "bg-violet-500/15 ring-violet-600/25",
  iconClass: "text-violet-900",
};

const BASE_METAL: MarkVisual = {
  icon: MetalBeamIcon,
  label: "Base metals",
  markClass: "bg-sky-500/18 ring-sky-600/30",
  iconClass: "text-sky-900",
};

const PRECIOUS: MarkVisual = {
  icon: BullionBarIcon,
  label: "Precious metals",
  markClass: "bg-yellow-400/25 ring-amber-600/35",
  iconClass: "text-amber-950",
};

/** Instrument-specific metals / grains — natural appearance, light + dark. */
const GOLD: MarkVisual = {
  icon: BullionBarIcon,
  label: "Gold",
  markClass: "bg-amber-400/30 ring-amber-500/45 dark:bg-amber-400/20 dark:ring-amber-400/40",
  iconClass: "text-amber-800 dark:text-amber-300",
};

const SILVER: MarkVisual = {
  icon: BullionBarIcon,
  label: "Silver",
  markClass: "bg-slate-300/45 ring-slate-500/40 dark:bg-slate-300/15 dark:ring-slate-400/35",
  iconClass: "text-slate-600 dark:text-slate-300",
};

const COPPER: MarkVisual = {
  icon: MetalBeamIcon,
  label: "Copper",
  markClass: "bg-orange-700/20 ring-orange-800/40 dark:bg-orange-600/20 dark:ring-orange-500/40",
  iconClass: "text-orange-900 dark:text-orange-400",
};

const ALUMINIUM: MarkVisual = {
  icon: MetalBeamIcon,
  label: "Aluminium",
  markClass: "bg-zinc-300/50 ring-zinc-500/35 dark:bg-zinc-400/15 dark:ring-zinc-400/35",
  iconClass: "text-zinc-600 dark:text-zinc-300",
};

const NICKEL: MarkVisual = {
  icon: MetalBeamIcon,
  label: "Nickel",
  markClass: "bg-teal-800/15 ring-teal-900/35 dark:bg-teal-500/15 dark:ring-teal-400/35",
  iconClass: "text-teal-950 dark:text-teal-300",
};

const AGRICULTURE: MarkVisual = {
  icon: Wheat,
  label: "Agriculture",
  markClass: "bg-emerald-500/18 ring-emerald-600/30",
  iconClass: "text-emerald-900",
};

const CORN: MarkVisual = {
  icon: Wheat,
  label: "Corn",
  markClass: "bg-yellow-400/30 ring-yellow-600/40 dark:bg-yellow-400/18 dark:ring-yellow-500/35",
  iconClass: "text-yellow-800 dark:text-yellow-300",
};

const BROAD: MarkVisual = {
  icon: Boxes,
  label: "Broad commodities",
  markClass: "bg-slate-500/15 ring-slate-500/30",
  iconClass: "text-slate-800",
};

const FALLBACK: MarkVisual = {
  icon: Boxes,
  label: "Commodity",
  markClass: "bg-muted ring-border",
  iconClass: "text-muted-foreground",
};

const GROUP_VISUALS: Record<CommodityGroupId, MarkVisual> = {
  energy: ENERGY,
  metals: BASE_METAL,
  agriculture: AGRICULTURE,
};

const INSTRUMENT_VISUALS: Record<string, MarkVisual> = {
  brent: BRENT,
  wti: WTI,
  ttf: GAS,
  "henry-hub": GAS,
  "nordic-power": POWER,
  gold: GOLD,
  silver: SILVER,
  copper: COPPER,
  aluminium: ALUMINIUM,
  nickel: NICKEL,
  wheat: AGRICULTURE,
  corn: CORN,
};

const SECTOR_VISUALS: Record<string, MarkVisual> = {
  "Broad Commodities": BROAD,
  Energy: ENERGY,
  "Base Metals": BASE_METAL,
  "Industrial Metals": BASE_METAL,
  "Precious Metals": PRECIOUS,
  Agriculture: AGRICULTURE,
};

function Mark({
  visual,
  size = "md",
}: {
  visual: MarkVisual;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const Icon = visual.icon;
  const box =
    size === "xl"
      ? "size-12 rounded-md" /* 48px — desk strip identity */
      : size === "lg"
        ? "size-10 rounded-md"
        : size === "sm"
          ? "size-5 rounded-md"
          : "size-7 rounded-md";
  const glyph =
    size === "xl" ? "size-6" : size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";
  const stroke = size === "xl" ? 1.85 : 2;
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center ring-1",
        visual.markClass,
        box,
      ].join(" ")}
      title={visual.label}
      aria-hidden
    >
      <Icon className={[visual.iconClass, glyph].join(" ")} strokeWidth={stroke} />
    </span>
  );
}

export function SectorMark({
  exposure,
  size = "md",
}: {
  exposure: string | null | undefined;
  size?: "sm" | "md";
}) {
  return <Mark visual={(exposure && SECTOR_VISUALS[exposure]) || FALLBACK} size={size} />;
}

export function GroupMark({
  group,
  size = "sm",
}: {
  group: CommodityGroupId;
  size?: "sm" | "md";
}) {
  return <Mark visual={GROUP_VISUALS[group] ?? FALLBACK} size={size} />;
}

export function InstrumentMark({
  id,
  size = "sm",
}: {
  id: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return <Mark visual={INSTRUMENT_VISUALS[id] ?? FALLBACK} size={size} />;
}
