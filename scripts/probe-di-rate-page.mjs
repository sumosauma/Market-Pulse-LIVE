const res = await fetch("https://www.di.se/rantor/stat-10y-33383/", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
const h = await res.text();
const insrefs = [...h.matchAll(/insref["']?\s*[:=]\s*["']?(\d+)/gi)].map((m) => m[1]);
console.log("insrefs", [...new Set(insrefs)]);
const urls = [...h.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
const interesting = urls.filter((u) => /api|chart|history|quote|millistream|stock-realtime/i.test(u));
console.log("interesting urls", [...new Set(interesting)].slice(0, 15));
