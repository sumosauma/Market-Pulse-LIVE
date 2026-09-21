## Goal

Pure **data-only briefing**: per instrument, say exactly what happened today and over the last 5 days, with a small sparkline next to each line. No theory inside the segments. News pulled out into its own section. Tying paragraph at the end.

## What changes

### 1. Backend: add 5-day history + fix gold/brent (`src/lib/markets.functions.ts`)

- Each `Quote` gets a new field: `history: { date: string; price: number }[]` — last 5 trading days, oldest → newest.
- Yahoo path already fetches `range=5d` — just keep all closes instead of only last + previous. FRED path: ask for last 7 days, keep last 5. Riksbank/CBOE/CNN: same — slice last 5.
- **Fix gold/brent**: switch primary source for `GC=F` and `BZ=F` from FRED to Yahoo (the FRED series for gold is the London PM fix and is often days stale → showing wrong price). FRED becomes fallback only. Bump `LAST_RESORT_SNAPSHOT` for gold to a realistic floor (~$3,400).
- New derived fields per quote (computed server-side so the model gets clean facts):
  - `change5d` and `changePercent5d` (vs 5 sessions ago)
  - `range5d`: `{ min, max }` — for "highest/lowest in 5d" lines
  - `streak`: e.g. `+3` (3 sessions up in a row) or `-2` — tiny but lets the model say "third straight day down" or "flat 4 sessions then jumped".

### 2. Prompt rewrite (`src/lib/analysis.functions.ts`)

The model receives, per instrument: today's price + today's change + 5-day change + 5-day range + streak. It writes ONE short bullet per instrument, **pure facts, no "because"**:

```
## Rates
- **US 10Y:** 4.32% · today +6 bps · 5d +11 bps · highest in 5 sessions.
- **US 3M:** 5.28% · flat today · 5d −2 bps.
- **Sweden 10Y:** 2.41% · today −2 bps · 5d −4 bps · 4 quiet sessions.
- **Sweden 2Y:** 2.18% · flat.

## Equities
- **S&P 500:** 5,830 · −0.4% today · −1.2% over 5d · 3rd down day in a row.
- **OMXS30:** 2,612 · +0.3% today · +0.8% over 5d.

## Inflation & Commodities
- **Brent:** $82.10 · +1.1% today · +3.4% over 5d · highest of the week.
- **Gold:** $3,420 · −0.2% today · flat over 5d.
- **US 10Y breakeven:** 2.34% · flat today · flat 5d.

## Forex
- **DXY:** 104.2 · −0.1% today · −0.6% over 5d.
- **USD/SEK:** 10.62 · −0.3% today · −0.9% over 5d · krona at 5d high vs USD.
- **EUR/SEK:** 11.48 · flat today.

## Volatility
- **VIX:** 14.1 · +0.4 today · stuck in 13.5–14.3 range all week.
- **SKEW:** 142 · −1 today.
- **Fear & Greed:** 62 (Greed) · steady.

---

## Top news
3 most relevant headlines from Bloomberg / FT / Dagens Industri:
- **[FT]** "Headline" — one short factual line on what it reports.
- **[Bloomberg]** "Headline" — …
- **[DI]** "Headline" — …

## The big picture
3–5 sentences. Only here is reasoning allowed. Tie segments + the 3 news items together. End with one open question. No verdict.
```

Prompt rules:
- Inside segments: **facts only**, no "could be because".
- Use `·` separators, bold instrument label, lowercase units.
- Skip a bullet entirely if the instrument has no data (don't invent).
- Total length: ~250–320 words.

### 3. Frontend: sparklines + restructured component

#### `src/components/Sparkline.tsx` (new)
Tiny SVG sparkline, ~80×24 px, takes `number[]`, draws a polyline. Color: emerald if last ≥ first, rose if last < first. No deps — pure SVG.

#### `src/components/AnalysisBriefing.tsx`
- Parser still splits on `##`. Add a "Top news" full-width slot in addition to "The big picture".
- Render order: segment grid (2-col on desktop, 1-col mobile) → Top news card (📰, slate accent) → The big picture card (existing primary accent).
- For each segment card: parse the bullet lines (`- **Label:** rest`), render each as a row with: instrument label · facts · **inline sparkline on the right**, fed from the matching quote's `history`. Pass `quotes` into the component as a prop so it can match instrument label → history.
- Tighter typography: smaller line height, mono font for numbers.

#### `src/routes/index.tsx`
Pass `data?.quotes` into `<AnalysisBriefing markdown={...} quotes={...} />`.

### Out of scope
- Streaming the response.
- Chart interactivity (hover tooltips). Sparkline is decorative.
- Storing historical snapshots beyond the 5d Yahoo/FRED window already provides.

### Technical notes
- Files touched: `src/lib/markets.functions.ts` (history field, gold/brent source), `src/lib/analysis.functions.ts` (prompt + pass derived fields), `src/components/AnalysisBriefing.tsx` (new layout + bullet parsing + sparklines), `src/components/Sparkline.tsx` (new), `src/routes/index.tsx` (prop wire-up).
- No new dependencies. Sparkline is plain SVG.
- Model stays `google/gemini-3-flash-preview`.
