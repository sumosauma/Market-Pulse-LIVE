import {
  fetchConsensusForObservation,
  parseInvestingHistoryRows,
} from "../src/lib/macroPulse/investingConsensus.ts";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/x-www-form-urlencoded",
  Origin: "https://www.investing.com",
  Referer: "https://www.investing.com/economic-calendar/",
  "X-Requested-With": "XMLHttpRequest",
};

async function hist(anchor) {
  const body = new URLSearchParams({
    eventID: "1",
    event_attr_ID: "905",
    event_timestamp: anchor,
    is_speech: "0",
  });
  const res = await fetch("https://www.investing.com/economic-calendar/more-history", {
    method: "POST",
    headers,
    body,
  });
  const json = await res.json();
  const rows = parseInvestingHistoryRows(json.historyRows);
  console.log("anchor", anchor, rows.map((r) => ({
    ref: r.referenceMonthKey,
    release: r.releaseDateIso,
    f: r.forecast,
    a: r.actual,
    prelim: r.isPreliminary,
  })));
}

await hist("2026-05-28");
await hist("2026-06-25");

const r = await fetchConsensusForObservation("us-core-pce", "2026-05-01", 3.4);
console.log("may pce", r);
