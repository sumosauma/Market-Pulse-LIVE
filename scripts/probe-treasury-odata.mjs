const url =
  "https://data.treasury.gov/feed.svc/DailyTreasuryYieldCurveRateData?$top=2&$orderby=NEW_DATE%20desc&$format=json";
const res = await fetch(url, {
  headers: {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  },
});
const text = await res.text();
console.log("status", res.status, "ctype", res.headers.get("content-type"));
console.log(text.slice(0, 800));
if (!res.ok) process.exit(1);
try {
  const j = JSON.parse(text);
  const rows = j.d?.results ?? j.value ?? [];
  console.log("\nkeys", rows[0] ? Object.keys(rows[0]) : "no rows");
  console.log("\nfirst", JSON.stringify(rows[0], null, 2));
} catch (e) {
  console.error("json parse fail", e);
}
