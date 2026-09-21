import type { MarketJournalNote } from "./marketJournalStorage";
import { getLocalDateKey } from "./marketJournalStorage";

export function getDisplayTitle(note: Pick<MarketJournalNote, "title" | "body">): string {
  const trimmedTitle = note.title.trim();
  if (trimmedTitle) return trimmedTitle;

  const firstLine = note.body.trim().split("\n")[0]?.trim();
  if (firstLine) {
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  }

  return "Untitled note";
}

export function getBodyPreview(body: string, maxLength = 80): string {
  const line = body.trim().split("\n")[0] ?? "";
  if (!line) return "No content yet";
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength)}…`;
}

export function formatDateGroupLabel(dateKey: string): string {
  const today = getLocalDateKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalDateKey(yesterdayDate);

  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";

  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface MarketJournalDateGroup {
  dateKey: string;
  label: string;
  notes: MarketJournalNote[];
}

export function groupNotesByDate(notes: MarketJournalNote[]): MarketJournalDateGroup[] {
  const byDate = new Map<string, MarketJournalNote[]>();

  for (const note of notes) {
    const bucket = byDate.get(note.dateKey) ?? [];
    bucket.push(note);
    byDate.set(note.dateKey, bucket);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, groupedNotes]) => ({
      dateKey,
      label: formatDateGroupLabel(dateKey),
      notes: groupedNotes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }));
}

export function filterNotes(notes: MarketJournalNote[], query: string): MarketJournalNote[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return notes;

  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(trimmed) || note.body.toLowerCase().includes(trimmed),
  );
}

export function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatNoteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
