const urls = [
  "https://sslecal2.investing.com/?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=5,72,6,54&calType=week&timeZone=8&lang=1",
  "https://sslecal2.forexprostools.com/?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&countries=5&calType=week&timeZone=8&lang=1",
];
for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  const text = await res.text();
  console.log({
    host: new URL(url).host,
    status: res.status,
    len: text.length,
    hasForecast: /forecast|Prev\.|Actual/i.test(text),
    starts: text.slice(0, 200).replace(/\s+/g, " "),
  });
}
