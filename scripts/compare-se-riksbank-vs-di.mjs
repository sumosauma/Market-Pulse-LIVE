/**
 * Compare Riksbank SWEA vs DI/Millistream Swedish rates (snapshot).
 * Run: node scripts/compare-se-riksbank-vs-di.mjs
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const RIKSBANK = [
  { label: "3M bill", maturity: "3M", seriesId: "SETB3MBENCH" },
  { label: "6M bill", maturity: "6M", seriesId: "SETB6MBENCH" },
  { label: "1M bill", maturity: "1M", seriesId: "SETB1MBENCHC" },
  { label: "2Y bond", maturity: "2Y", seriesId: "SEGVB2YC" },
  { label: "5Y bond", maturity: "5Y", seriesId: "SEGVB5YC" },
  { label: "7Y bond", maturity: "7Y", seriesId: "SEGVB7YC" },
  { label: "10Y bond", maturity: "10Y", seriesId: "SEGVB10YC" },
];

async function riksbankLatest(seriesId) {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 14);
  const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${start.toISOString().slice(0, 10)}/${end}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { ok: false, status: res.status, seriesId };
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) return { ok: false, seriesId, error: "empty" };
  const sorted = [...arr].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  return { ok: true, seriesId, date: last.date, value: last.value };
}

/** Parse DI /rantor/ Swedish table rows (Millistream, ~15m delayed). */
async function fetchDiSwedishRates() {
  const res = await fetch("https://www.di.se/rantor/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DI HTTP ${res.status}`);
  const html = await res.text();

  const section = html.split("Svenska räntor")[1]?.split("Tyska räntor")[0] ?? html;
  const rows = [];
  const rowRe =
    /<tr[^>]*>[\s\S]*?title="([^"]+)"[\s\S]*?<td>(?:\+)?([\d,]+)%<\/td>/gi;
  let m;
  while ((m = rowRe.exec(section)) !== null) {
    const title = m[1];
    const pct = parseFloat(m[2].replace(",", "."));
    let key = "";
    if (/Statsskuldsväxel 3/i.test(title)) key = "3M";
    else if (/Statsobligation 2/i.test(title)) key = "2Y";
    else if (/Statsobligation 5/i.test(title)) key = "5Y";
    else if (/Statsobligation 10/i.test(title)) key = "10Y";
    else if (/Statsobligation 30/i.test(title)) key = "30Y";
    else if (/Stibor/i.test(title)) key = "STIBOR3M";
    else if (/Swestr/i.test(title)) key = "SWESTR";
    if (key) rows.push({ key, value: pct, title });
  }

  return { rows, source: "DI/Millistream via di.se/rantor", delayedNote: "15 min delay per DI footer" };
}

const DI_TO_GRID = {
  "3M": "3M",
  "2Y": "2Y",
  "5Y": "5Y",
  "10Y": "10Y",
  "30Y": "30Y",
};

async function main() {
  console.log(`Comparison at ${new Date().toISOString()}\n`);

  const di = await fetchDiSwedishRates();
  const diMap = Object.fromEntries(di.rows.map((r) => [r.key, r.value]));

  console.log("DI/Millistream parsed:");
  for (const r of di.rows) console.log(`  ${r.key}: ${r.value.toFixed(3)}%`);
  console.log(`  (${di.delayedNote})\n`);

  console.log("| Maturity | Riksbank | DI/Millistream | Diff (DI−RB) bps | RB date |");
  console.log("|---|---:|---:|---:|---|");

  const diffs = [];

  for (const s of RIKSBANK) {
    await new Promise((r) => setTimeout(r, 2000));
    const rb = await riksbankLatest(s.seriesId);
    const diVal = DI_TO_GRID[s.maturity] ? diMap[DI_TO_GRID[s.maturity]] : undefined;
    if (!rb.ok) {
      console.log(`| ${s.maturity} (${s.label}) | ERR ${rb.status ?? rb.error} | ${diVal?.toFixed(3) ?? "—"}% | — | — |`);
      continue;
    }
    const diffBps = diVal != null ? (diVal - rb.value) * 100 : null;
    if (diffBps != null) diffs.push({ maturity: s.maturity, diffBps, rb: rb.value, di: diVal });
    console.log(
      `| ${s.maturity} | ${rb.value.toFixed(3)}% | ${diVal != null ? diVal.toFixed(3) + "%" : "—"} | ${diffBps != null ? (diffBps >= 0 ? "+" : "") + diffBps.toFixed(1) : "—"} | ${rb.date} |`,
    );
  }

  // 30Y DI only
  if (diMap["30Y"] != null) {
    console.log(`| 30Y | — (not in RB API) | ${diMap["30Y"].toFixed(3)}% | — | DI only |`);
  }

  if (diffs.length) {
    const abs = diffs.map((d) => Math.abs(d.diffBps));
    const max = diffs.reduce((a, b) => (Math.abs(b.diffBps) > Math.abs(a.diffBps) ? b : a));
    const avg = abs.reduce((s, x) => s + x, 0) / abs.length;
    console.log(`\nSummary: avg |diff| = ${avg.toFixed(1)} bps, max = ${Math.abs(max.diffBps).toFixed(1)} bps (${max.maturity})`);
  }

  // Risk signal impact (2s10s spread)
  const rb2 = await riksbankLatest("SEGVB2YC");
  await new Promise((r) => setTimeout(r, 800));
  const rb10 = await riksbankLatest("SEGVB10YC");
  if (rb2.ok && rb10.ok && diMap["2Y"] != null && diMap["10Y"] != null) {
    const rbSpread = (rb10.value - rb2.value) * 100;
    const diSpread = (diMap["10Y"] - diMap["2Y"]) * 100;
    console.log(`\n2s10s spread: Riksbank ${rbSpread.toFixed(1)} bps vs DI ${diSpread.toFixed(1)} bps (Δ ${(diSpread - rbSpread).toFixed(1)} bps)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
