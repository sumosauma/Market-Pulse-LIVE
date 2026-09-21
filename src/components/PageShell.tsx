import { AppHeader } from "./AppHeader";
import { TopNewsBanner } from "./TopNewsBanner";

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky chrome: header + news ticker stay pinned until scrolled back to the top */}
      <div className="sticky top-0 z-30">
        <AppHeader />
        <TopNewsBanner />
      </div>
      <main className="mx-auto max-w-[1600px] px-5 py-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Panel({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-md border border-border bg-card shadow-[0_1px_0_0_rgba(15,23,42,0.03)]",
        className ?? "",
      ].join(" ")}
    >
      {(title || actions || meta) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                {title}
              </h2>
            )}
            {meta ? (
              <p className="mt-1 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted-foreground">
                {meta}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
