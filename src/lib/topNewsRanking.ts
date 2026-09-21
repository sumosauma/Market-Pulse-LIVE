/**
 * Top News Banner ranking — editorial prominence + recency + market relevance.
 * Not click/popularity data; RSS + public page headline metadata only.
 */

import { getPersistenceBoost, recordStoryPersistence } from "./topNewsPersistence";

export type HeadlineOrigin = "rss" | "front_page" | "markets_page" | "breaking";

export type FrontPageTier =
  | "main_lead"
  | "secondary_lead"
  | "breaking"
  | "top_module"
  | "lower_module";

export const PER_SOURCE_FETCH = 10;
export const BANNER_SIZE = 8;
export const MAX_PER_SOURCE = 3;
export const STALE_PENALTY = 12;
export const MISSING_DATE_PENALTY = 5;
export const SCORE_CLOSE_RATIO = 0.8;

/** Target freshness window (tier 0). */
export const FRESHNESS_PRIMARY_HOURS_WEEKDAY = 24;
export const FRESHNESS_PRIMARY_HOURS_WEEKEND = 48;
/** Soft fallback with stale penalty (tier 1). Hard max — nothing older is selected. */
export const FRESHNESS_SOFT_MAX_WEEKDAY = 36;
export const FRESHNESS_SOFT_MAX_WEEKEND = 72;

export interface RawHeadline {
  source: string;
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string | null;
  feedPosition: number | null;
  frontPageTier: FrontPageTier | null;
  modulePosition: number | null;
  origins: HeadlineOrigin[];
}

export interface ScoredHeadline extends RawHeadline {
  score: number;
  editorialPriorityScore: number;
  recencyScore: number;
  marketKeywordScore: number;
  crossSourceBoost: number;
  persistenceBoost: number;
  stalePenalty: number;
  nonMarketPenalty: number;
  missingDatePenalty: number;
  freshnessTier: number;
  ageHours: number | null;
  clusterId: string;
  selectionTier: number;
  selectionReason: string;
}

export interface RankedSelection {
  headlines: RawHeadline[];
  debug: ScoredHeadline[];
  stats: SelectionStats;
  fallbackTierUsed: number;
  warning?: string;
}

export interface SelectionStats {
  rssCountBySource: Record<string, number>;
  frontPageCountBySource: Record<string, number>;
  mergedCandidateCount: number;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  Bloomberg: 12,
  FT: 11,
  WSJ: 11,
  DI: 10,
};

const TIER_STRENGTH: Record<FrontPageTier, number> = {
  main_lead: 45,
  secondary_lead: 35,
  breaking: 30,
  top_module: 20,
  lower_module: 12,
};

const MARKET_KEYWORDS = [
  "fed",
  "fomc",
  "powell",
  "ecb",
  "lagarde",
  "riksbank",
  "boe",
  "boj",
  "central bank",
  "rate",
  "rates",
  "yields",
  "bond",
  "treasury",
  "inflation",
  "cpi",
  "pce",
  "payrolls",
  "jobs",
  "gdp",
  "pmi",
  "recession",
  "stocks",
  "equities",
  "s&p",
  "nasdaq",
  "dow",
  "stoxx",
  "dax",
  "ftse",
  "omx",
  "wall street",
  "oil",
  "brent",
  "wti",
  "gold",
  "copper",
  "commodit",
  "dollar",
  "euro",
  "yen",
  "sek",
  "fx",
  "currency",
  "trump",
  "tariff",
  "tariffs",
  "trade war",
  "china",
  "iran",
  "hormuz",
  "ukraine",
  "russia",
  "sanction",
  "opec",
  "middle east",
];

const NON_MARKET_PATTERNS: Array<{ pattern: RegExp; penalty: number }> = [
  { pattern: /\b(celebrity|entertainment|lifestyle|recipe|travel|wedding|fashion week)\b/i, penalty: 20 },
  {
    pattern:
      /\b(relationship|hollywood|tv show|movie|album|sports?\b|football|basketball|soccer)\b/i,
    penalty: 20,
  },
  {
    pattern:
      /\b(credit card advice|retirement tip|401\s*\(\s*k\s*\)|who qualifies|settlement deadline|my neighbor|he threatened)\b/i,
    penalty: 15,
  },
  { pattern: /\b(personal finance|real estate listing|mortgage advice)\b/i, penalty: 15 },
];

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "as",
  "by",
  "with",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "after",
  "before",
  "over",
  "under",
  "into",
  "about",
  "says",
  "said",
  "amid",
  "new",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
]);

const US_MARKET_HOLIDAYS = new Set([
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

function isoDateLocal(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isUSMarketHoliday(d: Date): boolean {
  return US_MARKET_HOLIDAYS.has(isoDateLocal(d));
}

export function isRelaxedFreshnessDay(d: Date): boolean {
  return isWeekend(d) || isUSMarketHoliday(d);
}

export function getFreshnessLimits(relaxedDay: boolean): {
  primaryMax: number;
  softMax: number;
} {
  return {
    primaryMax: relaxedDay ? FRESHNESS_PRIMARY_HOURS_WEEKEND : FRESHNESS_PRIMARY_HOURS_WEEKDAY,
    softMax: relaxedDay ? FRESHNESS_SOFT_MAX_WEEKEND : FRESHNESS_SOFT_MAX_WEEKDAY,
  };
}

export function isWithinSoftCutoff(ageHours: number | null, relaxedDay: boolean): boolean {
  if (ageHours === null || !Number.isFinite(ageHours)) return false;
  return ageHours <= getFreshnessLimits(relaxedDay).softMax;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const key of ["mod", "utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
      u.searchParams.delete(key);
    }
    const path = u.pathname.replace(/\/$/, "") || "/";
    return `${u.origin}${path}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s[-–|]\s*(bloomberg|reuters|financial times|ft|wsj|di|dagens industri).*$/i, "")
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function computeFeedPositionScore(position: number | null): number {
  if (position === null || position <= 0) return 0;
  if (position <= 1) return 25;
  if (position === 2) return 18;
  if (position === 3) return 12;
  if (position === 4) return 10;
  if (position === 5) return 8;
  if (position === 6) return 5;
  if (position <= 8) return 3;
  return 2;
}

export function computeFrontPagePositionScore(
  tier: FrontPageTier | null,
  modulePosition: number | null,
): number {
  if (!tier) return 0;
  if (tier === "main_lead") return 45;
  if (tier === "secondary_lead") return 35;
  if (tier === "breaking") return 30;
  if (tier === "top_module") {
    const pos = modulePosition ?? 99;
    return pos <= 3 ? 28 : pos <= 8 ? 20 : 12;
  }
  return 12;
}

export function computeEditorialPriorityScore(h: RawHeadline): number {
  return Math.max(
    computeFeedPositionScore(h.feedPosition),
    computeFrontPagePositionScore(h.frontPageTier, h.modulePosition),
  );
}

export function computeRecencyScore(ageHours: number | null): number {
  if (ageHours === null || !Number.isFinite(ageHours) || ageHours < 0) return 0;
  if (ageHours <= 2) return 30;
  if (ageHours <= 6) return 26;
  if (ageHours <= 12) return 22;
  if (ageHours <= 18) return 18;
  if (ageHours <= 24) return 14;
  if (ageHours <= 36) return 8;
  if (ageHours <= 48) return 4;
  return 0;
}

function textBlob(h: Pick<RawHeadline, "title" | "snippet">): string {
  return `${h.title} ${h.snippet ?? ""}`.toLowerCase();
}

export function computeMarketKeywordScore(h: Pick<RawHeadline, "title" | "snippet">): number {
  const blob = textBlob(h);
  let score = 0;
  for (const kw of MARKET_KEYWORDS) {
    if (blob.includes(kw)) score += 4;
  }
  return Math.min(24, score);
}

export function computeSourceWeight(sourceLabel: string): number {
  return SOURCE_WEIGHTS[sourceLabel] ?? 8;
}

export function computeNonMarketPenalty(
  h: Pick<RawHeadline, "title" | "snippet">,
  marketKeywordScore: number,
): number {
  const blob = textBlob(h);
  let penalty = 0;
  for (const { pattern, penalty: p } of NON_MARKET_PATTERNS) {
    if (pattern.test(blob)) penalty = Math.max(penalty, p);
  }
  if (/^(analysis|opinion|column)\s*:/i.test(h.title.trim()) && marketKeywordScore < 8) {
    penalty = Math.max(penalty, 8);
  }
  if (marketKeywordScore >= 15 && penalty > 8) return 8;
  return penalty;
}

export function ageHoursFromPublishedAt(publishedAt: string | null, nowMs: number): number | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return null;
  return (nowMs - ms) / 3_600_000;
}

export function freshnessTier(ageHours: number | null, relaxedDay: boolean): number {
  if (ageHours === null || !Number.isFinite(ageHours) || ageHours < 0) {
    return 2;
  }
  const { primaryMax, softMax } = getFreshnessLimits(relaxedDay);
  if (ageHours <= primaryMax) return 0;
  if (ageHours <= softMax) return 1;
  return 2;
}

function stalePenaltyForTier(tier: number): number {
  return tier >= 1 ? STALE_PENALTY : 0;
}

function pickStrongerFrontPageTier(a: FrontPageTier | null, b: FrontPageTier | null): FrontPageTier | null {
  if (!a) return b;
  if (!b) return a;
  return TIER_STRENGTH[a] >= TIER_STRENGTH[b] ? a : b;
}

function pickNewerDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function mergeHeadlines(a: RawHeadline, b: RawHeadline): RawHeadline {
  const feedPosition =
    a.feedPosition === null
      ? b.feedPosition
      : b.feedPosition === null
        ? a.feedPosition
        : Math.min(a.feedPosition, b.feedPosition);

  const frontPageTier = pickStrongerFrontPageTier(a.frontPageTier, b.frontPageTier);
  const modulePosition =
    frontPageTier === a.frontPageTier
      ? (a.modulePosition ?? b.modulePosition)
      : frontPageTier === b.frontPageTier
        ? b.modulePosition
        : (a.modulePosition ?? b.modulePosition);

  return {
    source: a.source,
    sourceLabel: a.sourceLabel,
    title: a.title.length >= b.title.length ? a.title : b.title,
    url: a.url,
    publishedAt: pickNewerDate(a.publishedAt, b.publishedAt),
    snippet: a.snippet ?? b.snippet,
    feedPosition,
    frontPageTier,
    modulePosition,
    origins: [...new Set([...a.origins, ...b.origins])],
  };
}

/** Merge RSS + front-page duplicates by URL, then similar titles. */
export function mergeCandidates(candidates: RawHeadline[]): RawHeadline[] {
  const byUrl = new Map<string, RawHeadline>();
  for (const c of candidates) {
    const key = normalizeUrl(c.url);
    const existing = byUrl.get(key);
    byUrl.set(key, existing ? mergeHeadlines(existing, c) : { ...c, origins: [...c.origins] });
  }

  const merged = [...byUrl.values()];
  const kept: RawHeadline[] = [];

  for (const item of merged) {
    const tokens = titleTokens(item.title);
    const dupIdx = kept.findIndex((k) => jaccardSimilarity(tokens, titleTokens(k.title)) >= 0.85);
    if (dupIdx >= 0) {
      kept[dupIdx] = mergeHeadlines(kept[dupIdx]!, item);
      continue;
    }
    kept.push(item);
  }

  return kept;
}

export function computeCrossSourceClusters(
  candidates: RawHeadline[],
): Map<number, { id: string; sources: Set<string> }> {
  const tokensByIndex = candidates.map((c) => titleTokens(c.title));
  const parent = candidates.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const ti = tokensByIndex[i]!;
      const tj = tokensByIndex[j]!;
      const sim = jaccardSimilarity(ti, tj);
      const setB = new Set(tj);
      const shared = ti.filter((t) => setB.has(t)).length;
      if (sim >= 0.55 || shared >= 3) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < candidates.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }

  const result = new Map<number, { id: string; sources: Set<string> }>();
  for (const [, indices] of groups) {
    const sources = new Set(indices.map((i) => candidates[i]!.sourceLabel));
    const id = `cluster-${indices.sort((a, b) => a - b).join("-")}`;
    for (const i of indices) {
      result.set(i, { id, sources });
    }
  }
  return result;
}

export function crossSourceBoost(uniqueSourceCount: number): number {
  if (uniqueSourceCount >= 4) return 18;
  if (uniqueSourceCount === 3) return 14;
  if (uniqueSourceCount === 2) return 8;
  return 0;
}

export function scoreHeadline(
  h: RawHeadline,
  clusterSourceCount: number,
  nowMs: number,
  relaxedDay: boolean,
  persistenceBoost = 0,
): ScoredHeadline {
  const ageHours = ageHoursFromPublishedAt(h.publishedAt, nowMs);
  const tier = freshnessTier(ageHours, relaxedDay);
  const editorialPriorityScore = computeEditorialPriorityScore(h);
  const recencyScore = computeRecencyScore(ageHours);
  const marketKeywordScore = computeMarketKeywordScore(h);
  const crossBoost = crossSourceBoost(clusterSourceCount);
  const stalePenalty = stalePenaltyForTier(tier);
  const nonMarketPenalty = computeNonMarketPenalty(h, marketKeywordScore);
  const missingDatePenalty = h.publishedAt ? 0 : MISSING_DATE_PENALTY;

  const score =
    editorialPriorityScore +
    recencyScore +
    marketKeywordScore +
    computeSourceWeight(h.sourceLabel) +
    crossBoost +
    persistenceBoost -
    stalePenalty -
    nonMarketPenalty -
    missingDatePenalty;

  return {
    ...h,
    score,
    editorialPriorityScore,
    recencyScore,
    marketKeywordScore,
    crossSourceBoost: crossBoost,
    persistenceBoost,
    stalePenalty,
    nonMarketPenalty,
    missingDatePenalty,
    freshnessTier: tier,
    ageHours,
    clusterId: `solo-${normalizeUrl(h.url)}`,
    selectionTier: tier,
    selectionReason: "scored",
  };
}

function scoreAll(candidates: RawHeadline[], nowMs: number, relaxedDay: boolean): ScoredHeadline[] {
  const clusters = computeCrossSourceClusters(candidates);
  return candidates.map((h, i) => {
    const cluster = clusters.get(i)!;
    const ageHours = ageHoursFromPublishedAt(h.publishedAt, nowMs);
    const tier = freshnessTier(ageHours, relaxedDay);
    const persistenceBoost =
      tier === 0 ? getPersistenceBoost(h.title, nowMs, ageHours, relaxedDay) : 0;
    const scored = scoreHeadline(h, cluster.sources.size, nowMs, relaxedDay, persistenceBoost);
    return { ...scored, clusterId: cluster.id, freshnessTier: tier, selectionTier: tier };
  });
}

function clusterRepresentativeScore(a: ScoredHeadline, b: ScoredHeadline): number {
  if (b.score !== a.score) return b.score - a.score;
  const aFront = a.origins.some((o) => o !== "rss") ? 1 : 0;
  const bFront = b.origins.some((o) => o !== "rss") ? 1 : 0;
  if (bFront !== aFront) return bFront - aFront;
  return computeSourceWeight(b.sourceLabel) - computeSourceWeight(a.sourceLabel);
}

function dedupeClustersBeforeSelection(scored: ScoredHeadline[]): ScoredHeadline[] {
  const byCluster = new Map<string, ScoredHeadline>();
  for (const item of scored) {
    const existing = byCluster.get(item.clusterId);
    if (!existing || clusterRepresentativeScore(existing, item) > 0) {
      byCluster.set(item.clusterId, item);
    }
  }
  return [...byCluster.values()];
}

function annotateSelection(
  items: ScoredHeadline[],
  selectionTier: number,
  reason: string,
): ScoredHeadline[] {
  return items.map((item) => ({
    ...item,
    selectionTier,
    selectionReason: reason,
  }));
}

function selectWithDiversity(
  pool: ScoredHeadline[],
  successfulSourceCount: number,
  maxCount: number,
): ScoredHeadline[] {
  const selected: ScoredHeadline[] = [];
  const sourceCounts = new Map<string, number>();
  const usedClusters = new Set<string>();
  const usedUrls = new Set<string>();

  function canAdd(item: ScoredHeadline, enforceMaxPerSource: boolean): boolean {
    if (usedUrls.has(normalizeUrl(item.url))) return false;
    if (usedClusters.has(item.clusterId)) return false;
    if (enforceMaxPerSource && (sourceCounts.get(item.sourceLabel) ?? 0) >= MAX_PER_SOURCE) {
      return false;
    }
    return true;
  }

  function add(item: ScoredHeadline): void {
    selected.push(item);
    sourceCounts.set(item.sourceLabel, (sourceCounts.get(item.sourceLabel) ?? 0) + 1);
    usedClusters.add(item.clusterId);
    usedUrls.add(normalizeUrl(item.url));
  }

  const sorted = [...pool].sort((a, b) => b.score - a.score);

  for (const item of sorted) {
    if (selected.length >= maxCount) break;
    if (!canAdd(item, true)) continue;
    add(item);
  }

  if (selected.length < maxCount) {
    for (const item of sorted) {
      if (selected.length >= maxCount) break;
      if (!canAdd(item, false)) continue;
      add(item);
    }
  }

  if (successfulSourceCount >= 3 && selected.length > 0) {
    const represented = new Set(selected.map((s) => s.sourceLabel));
    for (const sourceLabel of new Set(pool.map((p) => p.sourceLabel))) {
      if (represented.has(sourceLabel)) continue;
      const best = pool
        .filter((p) => p.sourceLabel === sourceLabel)
        .sort((a, b) => b.score - a.score)[0];
      if (!best) continue;
      const minSelected = selected.reduce(
        (min, s) => (s.score < min.score ? s : min),
        selected[0]!,
      );
      if (selected.length >= maxCount && minSelected && best.score >= minSelected.score * SCORE_CLOSE_RATIO) {
        const overIdx = selected.findIndex(
          (s) => (sourceCounts.get(s.sourceLabel) ?? 0) > 2 && s.score === minSelected.score,
        );
        const dropIdx = overIdx >= 0 ? overIdx : selected.indexOf(minSelected);
        if (dropIdx >= 0 && !usedClusters.has(best.clusterId)) {
          const dropped = selected[dropIdx]!;
          usedClusters.delete(dropped.clusterId);
          usedUrls.delete(normalizeUrl(dropped.url));
          sourceCounts.set(dropped.sourceLabel, (sourceCounts.get(dropped.sourceLabel) ?? 1) - 1);
          selected.splice(dropIdx, 1);
          add(best);
          represented.add(sourceLabel);
        }
      }
    }
  }

  return selected.sort((a, b) => b.score - a.score);
}

export function selectTopHeadlines(
  candidates: RawHeadline[],
  nowMs = Date.now(),
  stats?: Partial<SelectionStats>,
): RankedSelection {
  const relaxedDay = isRelaxedFreshnessDay(new Date(nowMs));
  const limits = getFreshnessLimits(relaxedDay);
  const merged = mergeCandidates(candidates);
  const successfulSources = new Set(merged.map((c) => c.sourceLabel)).size;

  const withinSoft = merged.filter((h) =>
    isWithinSoftCutoff(ageHoursFromPublishedAt(h.publishedAt, nowMs), relaxedDay),
  );
  const excludedStale = merged.length - withinSoft.length;

  const allScored = dedupeClustersBeforeSelection(scoreAll(withinSoft, nowMs, relaxedDay));

  let fallbackTierUsed = 0;
  let warning: string | undefined;
  let selected: ScoredHeadline[] = [];

  const tier0Pool = allScored.filter((s) => s.freshnessTier === 0);
  selected = selectWithDiversity(tier0Pool, successfulSources, BANNER_SIZE);
  selected = annotateSelection(
    selected,
    0,
    "primary freshness window (editorial + relevance ranking)",
  );

  if (selected.length === 0) {
    fallbackTierUsed = 1;
    warning = `[top-news] no headlines within ${limits.primaryMax}h — using soft fallback up to ${limits.softMax}h`;
    const tier1Pool = allScored.filter((s) => s.freshnessTier === 1);
    selected = selectWithDiversity(tier1Pool, successfulSources, BANNER_SIZE);
    selected = annotateSelection(
      selected,
      1,
      `soft fallback within ${limits.softMax}h (stale penalty applied)`,
    );
  }

  if (selected.length === 0 && allScored.length > 0) {
    fallbackTierUsed = 2;
    warning = `[top-news] emergency: all feeds stale — showing up to 4 freshest items within ${limits.softMax}h`;
    selected = annotateSelection(
      [...allScored]
        .sort((a, b) => (a.ageHours ?? Number.POSITIVE_INFINITY) - (b.ageHours ?? Number.POSITIVE_INFINITY))
        .slice(0, Math.min(4, BANNER_SIZE)),
      2,
      `emergency freshest-within-${limits.softMax}h (banner would otherwise be empty)`,
    );
  }

  if (excludedStale > 0) {
    console.info(`[top-news] excluded ${excludedStale} candidate(s) older than ${limits.softMax}h hard cutoff`);
  }
  if (warning) console.warn(warning);

  recordStoryPersistence(
    selected.map((h) => ({ title: h.title, frontPageTier: h.frontPageTier })),
    nowMs,
  );

  const headlines = selected.map(
    ({
      score: _s,
      clusterId: _c,
      editorialPriorityScore: _e,
      recencyScore: _r,
      marketKeywordScore: _m,
      crossSourceBoost: _x,
      persistenceBoost: _p,
      stalePenalty: _st,
      nonMarketPenalty: _n,
      missingDatePenalty: _md,
      freshnessTier: _t,
      ageHours: _a,
      selectionTier: _st2,
      selectionReason: _sr,
      ...h
    }) => h,
  );

  return {
    headlines,
    debug: selected,
    fallbackTierUsed,
    warning,
    stats: {
      rssCountBySource: stats?.rssCountBySource ?? {},
      frontPageCountBySource: stats?.frontPageCountBySource ?? {},
      mergedCandidateCount: merged.length,
    },
  };
}
