const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/x-www-form-urlencoded",
  Origin: "https://www.investing.com",
  Referer: "https://www.investing.com/economic-calendar/",
  "X-Requested-With": "XMLHttpRequest",
};

const ids = { cpi: 736, pce: 905, hicp: 317, kpif: 1214 };

for (const [name, id] of Object.entries(ids)) {
  const body = new URLSearchParams({
    eventID: "1",
    event_attr_ID: String(id),
    event_timestamp: "2026-08-25",
    is_speech: "0",
  });
  const res = await fetch("https://www.investing.com/economic-calendar/more-history", {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  console.log({
    name,
    id,
    status: res.status,
    ctype: res.headers.get("content-type"),
    len: text.length,
    starts: text.slice(0, 160).replace(/\s+/g, " "),
  });
}
