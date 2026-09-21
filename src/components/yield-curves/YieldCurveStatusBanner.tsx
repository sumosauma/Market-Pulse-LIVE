type BannerTone = "info" | "notice" | "warning" | "error";

const TONE_CLASS: Record<BannerTone, string> = {
  info: "border-border/80 bg-muted/25 text-foreground",
  notice: "border-border/80 bg-muted/20 text-muted-foreground",
  warning: "border-amber-500/25 bg-amber-500/[0.04] text-foreground",
  error: "border-destructive/30 bg-destructive/[0.06] text-foreground",
};

export function YieldCurveStatusBanner({
  tone = "info",
  title,
  children,
}: {
  tone?: BannerTone;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-md border px-4 py-3 text-[12px] leading-relaxed",
        TONE_CLASS[tone],
      ].join(" ")}
    >
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      {children ? (
        <div className={title ? "mt-1 text-[11px] text-muted-foreground" : ""}>{children}</div>
      ) : null}
    </div>
  );
}

export function YieldCurveMetaRow({
  label,
  value,
  sub,
  align = "right",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function YieldCurveStatusDivider() {
  return (
    <div
      className="hidden h-8 w-px shrink-0 bg-border sm:block"
      aria-hidden
    />
  );
}

/** Compact metadata block for the horizontal status strip below the page title. */
export function YieldCurveStatusItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 sm:flex-none">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] font-medium leading-snug text-foreground">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}
