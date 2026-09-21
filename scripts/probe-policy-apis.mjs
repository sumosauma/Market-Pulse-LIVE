const UA = "Mozilla/5.0 (compatible; MarketPulse/1.0)";

async function probe(name, url, init = {}) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json,text/csv,text/plain,*/*", "User-Agent": UA, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const t = await r.text();
    console.log(`\n=== ${name} HTTP ${r.status} ${url}`);
    console.log(t.slice(0, 420).replace(/\s+/g, " "));
  } catch (e) {
    console.log(`\n=== ${name} ERROR ${e instanceof Error ? e.message : e}`);
  }
}

await probe("ECB DFR", "https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?lastNObservations=3&format=jsondata");
await probe("BoE IUDBEDR", "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2025&Dateto=now&SeriesCodes=IUDBEDR&UsingCodes=Y&CSVF=TN");
await probe("BoC Valet", "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=5");
await probe("RBA F1 CSV", "https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv");
await probe("Norges IR", "https://data.norges-bank.no/api/data/IR/M.KPRA.NOK.A?format=sdmx-json&lastNObservations=5");
await probe("SNB data", "https://data.snb.ch/api/cube/snboffziza/data/csv/en");
await probe("Riksbank latest", "https://api.riksbank.se/swea/v1/Observations/Latest/SECBREPOEFF");
