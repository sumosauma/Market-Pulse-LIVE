const r = await fetch("https://www.di.se/rantor/stat-10y-33383/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html",
  },
});
console.log("status", r.status);
const html = await r.text();
console.log("len", html.length);

const urls = [...html.matchAll(/https?:[^"'\\\s]+(?:history|instrument|millistream|chart|api)[^"'\\\s]*/gi)].map(
  (m) => m[0],
);
console.log("urls", [...new Set(urls)].slice(0, 40));

const paths = [...html.matchAll(/["'](\/[^"']*(?:history|instrument|millistream|chart|rantor)[^"']*)["']/gi)].map(
  (m) => m[1],
);
console.log("paths", [...new Set(paths)].slice(0, 50));

console.log("has instrument-history", html.includes("instrument-history"));
console.log("has millistream", html.includes("millistream"));
console.log("has __NEXT_DATA__", html.includes("__NEXT_DATA__"));

const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (next) {
  const data = JSON.parse(next[1]);
  console.log("next keys", Object.keys(data));
  console.log(JSON.stringify(data).slice(0, 2000));
}

// Also try common history endpoints with browser UA
const candidates = [
  "https://www.di.se/market/instrument-history/33383/",
  "https://www.di.se/rantor/instrument-history/33383/",
  "https://www.di.se/api/rantor/instrument-history/33383/",
  "https://www.di.se/api/marketdata/instrument-history/33383/",
];
for (const u of candidates) {
  const res = await fetch(u, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: "https://www.di.se/rantor/stat-10y-33383/",
    },
  });
  const t = await res.text();
  console.log(res.status, u, t.slice(0, 120).replace(/\s+/g, " "));
}
