const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const url = "https://www.investing.com/economic-calendar/core-pce-price-index-905";

const first = await fetch(url, {
  headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
  redirect: "follow",
});
const cookie = first.headers.get("set-cookie");
console.log("first", first.status, cookie?.slice(0, 80));
await new Promise((r) => setTimeout(r, 2000));
const second = await fetch(url, {
  headers: {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: cookie?.split(";").slice(0, 2).join(";") ?? "",
    Referer: "https://www.investing.com/",
  },
});
const text = await second.text();
console.log("second", second.status, text.length, text.includes("Forecast"), text.slice(0, 120).replace(/\s+/g, " "));
