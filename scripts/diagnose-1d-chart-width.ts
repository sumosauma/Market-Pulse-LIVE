/**
 * Read-only 1D chart width diagnosis — delete after use.
 */
import { EQUITY_MARKET_BY_ID } from "../src/lib/equities/equityMarketsRegistry";
import {
  exchangeLocalDateKey,
  exchangeLocalMinutesSinceMidnight,
  exchangeTimezoneOverrideForTicker,
  exchangeTzFromRow,
} from "../src/lib/equities/equityExchangeTz";
import { intradayLastSession } from "../src/lib/equities/equityIntradaySession";
import {
  fmtSessionClock,
  getSessionWindowForMarket,
  mapSessionX,
} from "../src/lib/equities/equitySessionWindow";

const PLOT = { left: 28, right: 44 };
const plotW = 640 - PLOT.left - PLOT.right;

function fmtLocal(iso: string, tzName: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  return d.toLocaleTimeString("en-US", {
    timeZone: tzName,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function pctOfPlot(lastMinutes: number, window: { openMinutes: number; closeMinutes: number }): number {
  const span = window.closeMinutes - window.openMinutes;
  const clamped = Math.min(window.closeMinutes, Math.max(window.openMinutes, lastMinutes));
  return ((clamped - window.openMinutes) / span) * 100;
}

async function yahooIntraday(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=30m&range=5d`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const json = await res.json();
  const r = json.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const points: { date: string; price: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (typeof closes[i] === "number") {
      points.push({ date: new Date(ts[i] * 1000).toISOString(), price: closes[i] });
    }
  }
  return {
    yahooTz: r?.meta?.exchangeTimezoneName ?? null,
    gmtoffset: r?.meta?.gmtoffset ?? null,
    points,
    rawCount: ts.length,
  };
}

const MARKETS = [
  { id: "BR", name: "Brazil / Bovespa", ticker: "^BVSP", source: "Yahoo Finance" },
  { id: "CA", name: "Canada / TSX", ticker: "^GSPTSE", source: "Yahoo Finance" },
  { id: "ZA", name: "South Africa / NQZA", ticker: "^NQZA", source: "Yahoo Finance / FRED" },
  { id: "DK", name: "Denmark / OMX Copenhagen 25", ticker: "^OMXC25", source: "Yahoo Finance" },
];

for (const m of MARKETS) {
  const config = EQUITY_MARKET_BY_ID[m.id]!;
  const { yahooTz, gmtoffset, points, rawCount } = await yahooIntraday(m.ticker);
  const override = exchangeTimezoneOverrideForTicker(m.ticker);
  const tz = exchangeTzFromRow({
    ticker: m.ticker,
    exchangeTimezoneName: yahooTz,
    gmtoffset,
    timezone: null,
  });
  const tzName = tz.exchangeTimezoneName ?? "UTC";
  const window = getSessionWindowForMarket(m.id, config.region)!;

  const session = intradayLastSession(points, tz);
  const sessionDate =
    session.length > 0 ? exchangeLocalDateKey(session[session.length - 1]!.date, tz) : null;

  const firstRaw = points[0];
  const lastRaw = points[points.length - 1];
  const firstSess = session[0];
  const lastSess = session[session.length - 1];

  const lastMins =
    lastSess != null ? exchangeLocalMinutesSinceMidnight(lastSess.date, tz) : null;
  const firstMins =
    firstSess != null ? exchangeLocalMinutesSinceMidnight(firstSess.date, tz) : null;

  const lastXPct =
    lastMins != null ? pctOfPlot(lastMins, window) : null;
  const lastX =
    lastMins != null ? mapSessionX(lastMins, window, PLOT.left, plotW) : null;
  const closeX = mapSessionX(window.closeMinutes, window, PLOT.left, plotW);

  // bars per exchange-local day
  const byDay = new Map<string, number>();
  for (const p of points) {
    const d = exchangeLocalDateKey(p.date, tz);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }

  console.log("\n=== " + m.name + " ===");
  console.log("A) ticker:", m.ticker, "| source:", m.source);
  console.log("   yahooTz:", yahooTz, "| override:", override ?? "none", "| used:", tzName);
  console.log(
    "   session:",
    fmtSessionClock(window.openMinutes),
    "-",
    fmtSessionClock(window.closeMinutes),
  );
  console.log("B) raw bars:", rawCount, "| valid closes:", points.length);
  if (firstRaw) {
    console.log("   first raw UTC:", firstRaw.date, "| local:", fmtLocal(firstRaw.date, tzName));
  }
  if (lastRaw) {
    console.log("   last raw UTC:", lastRaw.date, "| local:", fmtLocal(lastRaw.date, tzName));
  }
  console.log("   bars/day:", Object.fromEntries([...byDay.entries()].sort()));
  console.log("C) session date:", sessionDate, "| kept:", session.length);
  if (firstSess) {
    console.log("   first kept local:", fmtLocal(firstSess.date, tzName), "| mins:", firstMins);
  }
  if (lastSess) {
    console.log("   last kept local:", fmtLocal(lastSess.date, tzName), "| mins:", lastMins);
  }
  const complete =
    lastMins != null && lastMins >= window.closeMinutes - 30 ? "likely complete" : "incomplete vs close";
  console.log("   session status:", complete);
  console.log("D) x-axis: fixed session time (mapSessionX)");
  console.log(
    "   last bar at",
    lastXPct?.toFixed(1) + "% of session span",
    "| close tick at 100%",
  );
  console.log("   last bar x:", lastX?.toFixed(1), "| close x:", closeX.toFixed(1), "| plotW:", plotW);
  if (lastXPct != null) {
    const blankPct = 100 - lastXPct;
    console.log("   blank right of line ≈", blankPct.toFixed(1) + "% of plot");
  }
}
