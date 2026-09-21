export const MARKET_JOURNAL_STORAGE_KEY = "market-journal-notes";

/** Future-ready fields (tags, pinned, snapshot) are optional and unused in v1. */
export interface MarketJournalSnapshot {
  capturedAt?: string;
  route?: string;
  data?: unknown;
}

export interface MarketJournalNote {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  dateKey: string;
  tags?: string[];
  pinned?: boolean;
  snapshot?: MarketJournalSnapshot;
}

function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__market_journal_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function createNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function loadNotes(): MarketJournalNote[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(MARKET_JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is MarketJournalNote => {
        if (!item || typeof item !== "object") return false;
        const note = item as Record<string, unknown>;
        return (
          typeof note.id === "string" &&
          typeof note.title === "string" &&
          typeof note.body === "string" &&
          typeof note.createdAt === "string" &&
          typeof note.updatedAt === "string" &&
          typeof note.dateKey === "string"
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveNotes(notes: MarketJournalNote[]): boolean {
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.setItem(MARKET_JOURNAL_STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

export function createNote(input: { title: string; body: string }): MarketJournalNote {
  const now = new Date().toISOString();
  return {
    id: createNoteId(),
    title: input.title,
    body: input.body,
    createdAt: now,
    updatedAt: now,
    dateKey: getLocalDateKey(),
  };
}

/** Unsaved draft shown in the editor immediately after "New note". */
export function createDraftNote(): MarketJournalNote {
  return createNote({ title: "", body: "" });
}

export function normalizeNoteInput(input: {
  title: string;
  body: string;
}): { title: string; body: string } {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle) {
    return { title: trimmedTitle, body: input.body };
  }

  const firstLine = input.body.trim().split("\n")[0]?.trim() ?? "";
  return { title: firstLine, body: input.body };
}

export function isPersistedNote(notes: MarketJournalNote[], note: MarketJournalNote): boolean {
  return notes.some((item) => item.id === note.id);
}

export function updateNote(
  notes: MarketJournalNote[],
  id: string,
  input: { title: string; body: string },
): MarketJournalNote[] {
  return notes.map((note) =>
    note.id === id
      ? {
          ...note,
          title: input.title,
          body: input.body,
          updatedAt: new Date().toISOString(),
        }
      : note,
  );
}

export function deleteNote(notes: MarketJournalNote[], id: string): MarketJournalNote[] {
  return notes.filter((note) => note.id !== id);
}

export function isJournalStorageAvailable(): boolean {
  return isStorageAvailable();
}
