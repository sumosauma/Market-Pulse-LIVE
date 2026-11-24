/**
 * Local verification for header market-hours logic.
 * Run: npx tsx scripts/test-market-hours.mts
 */
import { __marketHoursTest, getMarketHoursStatuses } from "../src/lib/markets/marketHours.ts";

const { zonedWallToUtc, statusForVenue, VENUES } = __marketHoursTest;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function venue(id: "se" | "us") {
  const v = VENUES.find((item) => item.id === id);
  if (!v) throw new Error(`missing venue ${id}`);
  return v;
}

function atStockholm(y: number, m: number, d: number, h: number, min: number) {
  return zonedWallToUtc(y, m, d, h, min, "Europe/Stockholm");
}

function atNewYork(y: number, m: number, d: number, h: number, min: number) {
  return zonedWallToUtc(y, m, d, h, min, "America/New_York");
}

function check(
  label: string,
  now: Date,
  market: "se" | "us",
  expect: { open: boolean; nextIncludes?: string; known?: boolean },
) {
  const status = statusForVenue(venue(market), now);
  assert(status.isOpen === expect.open, `${label}: open=${status.isOpen} want ${expect.open}`);
  if (expect.known === false) {
    assert(!status.calendarKnown, `${label}: expected unknown calendar`);
    assert(status.nextLabel == null, `${label}: expected no next time`);
  } else {
    assert(status.calendarKnown, `${label}: expected known calendar`);
    if (expect.nextIncludes) {
      assert(
        status.nextLabel?.includes(expect.nextIncludes),
        `${label}: next="${status.nextLabel}" missing "${expect.nextIncludes}"`,
      );
    }
  }
  console.log(`  ✓ ${label} → ${status.isOpen ? "Open" : "Closed"} ${status.nextLabel ?? "(no time)"}`);
}

console.log("Market hours checks\n");

// Regular STO session (Tue 2026-11-24 10:00 Stockholm)
check("SE open mid-session", atStockholm(2026, 11, 24, 10, 0), "se", {
  open: true,
  nextIncludes: "17:30",
});

// SE before open
check("SE before open", atStockholm(2026, 11, 24, 8, 0), "se", {
  open: false,
  nextIncludes: "09:00",
});

// SE after close → next day open
check("SE after close", atStockholm(2026, 11, 24, 18, 0), "se", {
  open: false,
  nextIncludes: "09:00",
});

// Weekend
check("SE Saturday closed", atStockholm(2026, 11, 21, 12, 0), "se", {
  open: false,
  nextIncludes: "09:00",
});

// Christmas Eve 2026 closed
check("SE Christmas Eve closed", atStockholm(2026, 12, 24, 12, 0), "se", {
  open: false,
});

// Early close day — open at 11:00, closes 13:00
check("SE early-close open", atStockholm(2026, 10, 30, 11, 0), "se", {
  open: true,
  nextIncludes: "13:00",
});

// Early close day — after 13:00
check("SE early-close after", atStockholm(2026, 10, 30, 14, 0), "se", {
  open: false,
});

// US regular — 10:00 ET on Tue 2026-11-24 → open; close shows in Stockholm (16:00 ET = 22:00 CET)
check("US open mid-session", atNewYork(2026, 11, 24, 10, 0), "us", {
  open: true,
  nextIncludes: "22:00",
});

// US closed morning Stockholm before NY open: 14:00 Stockholm = 08:00 ET
check("US closed before NY open (Stockholm 14:00)", atStockholm(2026, 11, 24, 14, 0), "us", {
  open: false,
  nextIncludes: "15:30",
});

// US Thanksgiving 2026-11-26 closed
check("US Thanksgiving closed", atNewYork(2026, 11, 26, 12, 0), "us", {
  open: false,
});

// US early close day after Thanksgiving 2026-11-27 — open at 10 ET, close 13 ET = 19:00 Stockholm (CET)
check("US early-close open", atNewYork(2026, 11, 27, 10, 0), "us", {
  open: true,
  nextIncludes: "19:00",
});

// US spring-forward week (EU still CET): 16:00 EDT = 21:00 Stockholm
{
  const status = statusForVenue(venue("us"), atNewYork(2026, 3, 9, 10, 0));
  assert(status.isOpen, "US Mar9 should be open");
  assert(status.nextLabel === "Closes 21:00", `US Mar9 close want 21:00 got ${status.nextLabel}`);
  console.log(`  ✓ US DST (EU still CET) close → ${status.nextLabel}`);
}

// EU DST week 2026-03-30 Monday: both on summer time → 16:00 EDT = 22:00 CEST
check("US after EU DST", atNewYork(2026, 3, 30, 10, 0), "us", {
  open: true,
  nextIncludes: "22:00",
});

// Outside calendar → no invented times
{
  const status = statusForVenue(venue("se"), atStockholm(2028, 1, 5, 12, 0));
  assert(!status.calendarKnown, "2028 should be unknown");
  assert(status.nextLabel == null, "2028 must not invent open time");
  console.log("  ✓ Outside calendar year withholds times");
}

// Live snapshot
console.log("\nNow:");
for (const s of getMarketHoursStatuses()) {
  console.log(
    `  ${s.code} ${s.isOpen ? "Open" : "Closed"}${s.nextLabel ? ` · ${s.nextLabel}` : ""}`,
  );
}

console.log("\nAll market-hours checks passed.");
