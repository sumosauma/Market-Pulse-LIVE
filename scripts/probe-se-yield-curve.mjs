/** Probe all Sweden Riksbank SWEA series used by Yield Curves tab. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const SERIES = [
  { maturity: "10Y", seriesId: "SEGVB10YC" },
  { maturity: "1M", seriesId: "SETB1MBENCHC" },
  { maturity: "3M", seriesId: "SETB3MBENCH" },
  { maturity: "6M", seriesId: "SETB6MBENCH" },
  { maturity: "2Y", seriesId: "SEGVB2YC" },
  { maturity: "5Y", seriesId: "SEGVB5YC" },
];

const end = new Date().toISOString().slice(0, 10);
const startDate = new Date();
startDate.setUTCDate(startDate.getUTCDate() - 420);
const start = startDate.toISOString().slice(0, 10);

async function probe(seriesId) {
  const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start}/${end}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { seriesId, ok: false, status: res.status, ms, body: body.slice(0, 120) };
    }
    const arr = await res.json();
    const rows = Array.isArray(arr) ? arr : [];
    const last = rows[rows.length - 1];
    return {
      seriesId,
      ok: true,
      status: res.status,
      ms,
      rowCount: rows.length,
      firstDate: rows[0]?.date,
      lastDate: last?.date,
      lastValue: last?.value,
    };
  } catch (e) {
    return { seriesId, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

console.log(`Sweden yield curve probe ${new Date().toISOString()}`);
console.log(`Range: ${start} .. ${end}\n`);

for (const { maturity, seriesId } of SERIES) {
  const r = await probe(seriesId);
  console.log(`${maturity} (${seriesId}):`, JSON.stringify(r));
  await new Promise((x) => setTimeout(x, 1500));
}
