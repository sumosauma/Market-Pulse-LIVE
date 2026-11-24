import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Methodology / explanatory copy lives here — not on the desk surface. */
export function CommodityInfo({
  label,
  children,
  side = "top",
  align = "start",
  wide = false,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Info className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={[
            "border border-border bg-card px-2.5 py-2 text-left text-[11px] font-normal leading-relaxed text-foreground shadow-md",
            wide ? "max-w-[360px]" : "max-w-[280px]",
          ].join(" ")}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
