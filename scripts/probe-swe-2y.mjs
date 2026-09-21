const UA = "Mozilla/5.0";

async function fetchRiksbank(seriesId) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 400);
  const start = startDate.toISOString().slice(0, 10);
  const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start}/${today}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`Riksbank HTTP ${res.status}`);
  const arr = await res.json();
  const pts = arr
    .map((o) => ({ date: o.date, price: parseFloat(o.value) }))
    .filter((p) => Number.isFinite(p.price));
  const latest = pts.at(-1);
  console.log(seriesId, "ok rows=", pts.length, "latest=", latest);
}

await fetchRiksbank("SEGVB2YC");
await fetchRiksbank("SEGVB10YC");

const di = await fetch("https://www.di.se/market/instrument-history/33381/", {
  headers: { Accept: "application/json", "User-Agent": UA },
});
console.log("DI 33381 status", di.status);
