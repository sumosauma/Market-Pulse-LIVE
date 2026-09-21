/**
 * Short-lived in-memory persistence for stories that remain prominent across refreshes.
 * Resets on server restart. Not click/popularity data.
 * Persistence never overrides freshness — boost applies only within primary window.
 */

import {
  freshnessTier,
  normalizeTitle,
  type FrontPageTier,
} from "./topNewsRanking";

const TTL_MS = 24 * 60 * 60 * 1000;

interface PersistenceEntry {
  seenCount: number;
  lastSeenMs: number;
  frontPageLeadSeen: boolean;
}

const store = new Map<string, PersistenceEntry>();

function prune(nowMs: number): void {
  for (const [key, entry] of store) {
    if (nowMs - entry.lastSeenMs > TTL_MS) store.delete(key);
  }
}

export function storyFingerprint(title: string): string {
  return normalizeTitle(title);
}

/** Record selected headlines after each refresh (fresh items only). */
export function recordStoryPersistence(
  items: Array<{ title: string; frontPageTier: FrontPageTier | null }>,
  nowMs = Date.now(),
): void {
  prune(nowMs);
  for (const item of items) {
    const key = storyFingerprint(item.title);
    if (!key) continue;
    const prev = store.get(key);
    const frontPageLeadSeen =
      (prev?.frontPageLeadSeen ?? false) ||
      item.frontPageTier === "main_lead" ||
      item.frontPageTier === "breaking";
    store.set(key, {
      seenCount: (prev?.seenCount ?? 0) + 1,
      lastSeenMs: nowMs,
      frontPageLeadSeen,
    });
  }
}

/** +4 at 2 refreshes, +8 at 3+, capped at +10. Only when story is in primary freshness tier. */
export function getPersistenceBoost(
  title: string,
  nowMs: number,
  ageHours: number | null,
  relaxedDay: boolean,
): number {
  if (freshnessTier(ageHours, relaxedDay) !== 0) return 0;
  prune(nowMs);
  const entry = store.get(storyFingerprint(title));
  if (!entry) return 0;
  let boost = 0;
  if (entry.seenCount >= 3) boost = 8;
  else if (entry.seenCount >= 2) boost = 4;
  if (entry.frontPageLeadSeen && entry.seenCount >= 2) {
    boost = Math.min(10, boost + 4);
  }
  return boost;
}

export function clearPersistenceStore(): void {
  store.clear();
}
