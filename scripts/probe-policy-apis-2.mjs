const UA = "Mozilla/5.0 (compatible; MarketPulse/1.0)";

async function probe(name, url) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json,text/csv,text/plain,*/*", "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const t = await r.text();
    console.log(`\n=== ${name} HTTP ${r.status}`);
    console.log(t.slice(0, 500).replace(/\s+/g, " "));
  } catch (e) {
    console.log(`\n=== ${name} ERROR ${e instanceof Error ? e.message : e}`);
  }
}

await probe("Norges B.KPRA.SD.R", "https://data.norges-bank.no/api/data/IR/B.KPRA.SD.R?format=sdmx-json&lastNObservations=5");
await probe("SNB cube list", "https://data.snb.ch/api/cube/snboffzins/data/csv/en");
await probe("SNB zinssatz", "https://data.snb.ch/api/cube/snboffziza/data/csv/en?dimSel=D0(S0)");
await probe("BoJ policy", "https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=IR01&code=IR01MDJPN01&startDate=202501");
await probe("TCMB rates", "https://evds2.tcmb.gov.tr/service/evds/series=TP.PR.W1&type=json&frequency=1&aggregationTypes=last&startDate=01-01-2026&endDate=20-08-2026");
