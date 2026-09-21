const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function dump(label, url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log({
    label,
    status: res.status,
    ctype: res.headers.get("content-type"),
    setCookie: res.headers.get("set-cookie")?.slice(0, 120) ?? null,
    len: text.length,
    starts: text.slice(0, 180).replace(/\s+/g, " "),
  });
  return { res, text };
}

const common = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

await dump("pce-event-get", "https://www.investing.com/economic-calendar/core-pce-price-index-905", {
  headers: common,
});

await dump("calendar-get", "https://www.investing.com/economic-calendar/", { headers: common });

const body = new URLSearchParams({
  eventID: "1",
  event_attr_ID: "905",
  event_timestamp: "2026-08-26",
  is_speech: "0",
});
await dump("more-history-json-accept", "https://www.investing.com/economic-calendar/more-history", {
  method: "POST",
  headers: {
    ...common,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://www.investing.com",
    Referer: "https://www.investing.com/economic-calendar/core-pce-price-index-905",
    "X-Requested-With": "XMLHttpRequest",
  },
  body,
});

const calBody = new URLSearchParams({
  country: "5",
  dateFrom: "2026-08-25",
  dateTo: "2026-08-26",
  timeZone: "8",
  timeFilter: "timeRemain",
  currentTab: "custom",
  limit_from: "0",
});
await dump("filtered-calendar", "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData", {
  method: "POST",
  headers: {
    ...common,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://www.investing.com",
    Referer: "https://www.investing.com/economic-calendar/",
    "X-Requested-With": "XMLHttpRequest",
  },
  body: calBody,
});
