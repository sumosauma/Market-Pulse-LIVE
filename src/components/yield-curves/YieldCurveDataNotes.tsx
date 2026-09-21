import type { YieldMaturity } from "@/lib/yieldCurves/types";

export function YieldCurvePanelEmpty({
  title = "Data unavailable",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="mx-4 my-14 flex flex-col items-center justify-center px-4 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

/** Collapsible footnote for methodology and coverage — kept out of the main chart flow. */
export function YieldCurveDataNotes({
  structurallyMissing,
  unavailableMaturities,
  coverageNote,
}: {
  structurallyMissing: readonly YieldMaturity[];
  unavailableMaturities: readonly YieldMaturity[];
  /** Overrides the default official-only footnote when set (e.g. Sweden DI source). */
  coverageNote?: string;
}) {
  const hasCoverageNotes = structurallyMissing.length > 0 || unavailableMaturities.length > 0;

  return (
    <details className="group rounded-md border border-border/60 bg-muted/10 px-4 py-2.5">
      <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5 group-open:text-foreground">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/80 text-[10px] font-semibold leading-none text-muted-foreground group-open:border-foreground/20 group-open:text-foreground"
            aria-hidden
          >
            i
          </span>
          Data notes
        </span>
      </summary>
      <ul className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <li>
          {coverageNote ?? (
            <>
              <span className="font-medium text-foreground/90">Official-only mode.</span> Missing points
              are not estimated or externally filled.
            </>
          )}
        </li>
        {hasCoverageNotes ? (
          <>
            {structurallyMissing.length ? (
              <li>
                Not published on harmonized grid:{" "}
                <span className="tabular-nums text-foreground/80">
                  {structurallyMissing.join(", ")}
                </span>
                .
              </li>
            ) : null}
            {unavailableMaturities.length ? (
              <li>
                Temporarily unavailable this session:{" "}
                <span className="tabular-nums text-foreground/80">
                  {unavailableMaturities.join(", ")}
                </span>
                .
              </li>
            ) : null}
          </>
        ) : null}
      </ul>
    </details>
  );
}
