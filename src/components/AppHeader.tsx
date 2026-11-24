import { Link, useRouterState } from "@tanstack/react-router";

import { MarketHoursStatus } from "./MarketHoursStatus";
import { MarketJournalButton } from "./journal/MarketJournal";

const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/yield-curves", label: "Yield Curves" },
  { to: "/equities", label: "Equities" },
  { to: "/foreign-exchange", label: "Foreign Exchange" },
  { to: "/commodities", label: "Commodities" },
  { to: "/derivatives", label: "Volatility" },
  { to: "/morning-brief", label: "Morning Brief" },
  { to: "/emerging-markets", label: "Emerging Markets" },
  { to: "/watchlist", label: "Market Monitor" },
] as const;

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-5">
        <div className="flex h-10 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-[10px] font-bold tracking-tight text-primary-foreground">
              MP
            </div>
            <div className="leading-none">
              <div className="text-[13px] font-semibold tracking-tight text-foreground">
                Market Pulse <span className="font-normal text-muted-foreground">AI</span>
              </div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Institutional Macro Intelligence
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <MarketJournalButton />
            <MarketHoursStatus />
          </div>
        </div>
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto overflow-y-hidden">
          {TABS.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={[
                  "relative whitespace-nowrap px-3 py-2 text-[12px] font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
