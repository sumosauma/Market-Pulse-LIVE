import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { YieldCurveFetchSpinner } from "@/components/yield-curves/YieldCurveFetchSpinner";

export function FxInfo({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
        >
          <Info className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        className={[
          "border border-border bg-card px-2.5 py-2 text-left text-[11px] font-normal leading-relaxed text-foreground shadow-md",
          wide ? "max-w-[340px]" : "max-w-[280px]",
        ].join(" ")}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function FxChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={[
            "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
            option === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function FxSectionStatus({ label, message }: { label?: string; message?: string }) {
  if (message) {
    return <p className="px-4 py-10 text-center text-[12px] text-amber-700 dark:text-amber-400">{message}</p>;
  }
  return (
    <div className="flex min-h-[160px] items-center justify-center">
      <YieldCurveFetchSpinner label={label ?? "Loading"} />
    </div>
  );
}
