import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BookOpen } from "lucide-react";

import { loadNotes, type MarketJournalNote } from "@/lib/journal/marketJournalStorage";

import { MarketJournalLibrary } from "./MarketJournalLibrary";
import {
  MarketJournalFloatingNote,
  type NoteSaveStatus,
  type NoteWindowState,
} from "./MarketJournalFloatingNote";
import {
  getDefaultNotePosition,
  getDefaultNoteSize,
  type NoteWindowSize,
} from "./marketJournalWindowUtils";

export interface OpenNoteEntry {
  note: MarketJournalNote;
  window: NoteWindowState;
  isDirty: boolean;
  saveStatus: NoteSaveStatus;
}

interface MarketJournalContextValue {
  libraryOpen: boolean;
  libraryMinimized: boolean;
  toggleLibrary: () => void;
}

const MarketJournalContext = createContext<MarketJournalContextValue | null>(null);

function useMarketJournalContext() {
  const context = useContext(MarketJournalContext);
  if (!context) {
    throw new Error("MarketJournal components must be used within MarketJournalProvider");
  }
  return context;
}

function createOpenNoteEntry(note: MarketJournalNote, index: number, zIndex: number): OpenNoteEntry {
  const size = getDefaultNoteSize();
  return {
    note: { ...note },
    window: {
      noteId: note.id,
      position: getDefaultNotePosition(index, size),
      size,
      minimized: false,
      zIndex,
    },
    isDirty: false,
    saveStatus: "idle",
  };
}

export function MarketJournalProvider({ children }: { children: ReactNode }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMinimized, setLibraryMinimized] = useState(false);
  const [notes, setNotes] = useState<MarketJournalNote[]>([]);
  const [openNotes, setOpenNotes] = useState<OpenNoteEntry[]>([]);
  const [topZIndex, setTopZIndex] = useState(70);

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  const openNoteIds = useMemo(() => openNotes.map((entry) => entry.note.id), [openNotes]);

  const bringNoteToFront = useCallback((noteId: string) => {
    setTopZIndex((current) => {
      const next = current + 1;
      setOpenNotes((entries) =>
        entries.map((entry) =>
          entry.note.id === noteId
            ? { ...entry, window: { ...entry.window, zIndex: next } }
            : entry,
        ),
      );
      return next;
    });
  }, []);

  const handleOpenNote = useCallback((note: MarketJournalNote) => {
    setTopZIndex((currentZ) => {
      const nextZ = currentZ + 1;
      setOpenNotes((entries) => {
        const existing = entries.find((entry) => entry.note.id === note.id);
        if (existing) {
          return entries.map((entry) =>
            entry.note.id === note.id
              ? {
                  ...entry,
                  note: entry.isDirty ? entry.note : { ...note },
                  window: { ...entry.window, minimized: false, zIndex: nextZ },
                }
              : entry,
          );
        }

        return [...entries, createOpenNoteEntry(note, entries.length, nextZ)];
      });
      return nextZ;
    });

    setLibraryOpen(false);
    setLibraryMinimized(false);
  }, []);

  const handleCloseNote = useCallback((noteId: string) => {
    setOpenNotes((entries) => entries.filter((entry) => entry.note.id !== noteId));
  }, []);

  const handleNoteMinimizeChange = useCallback((noteId: string, minimized: boolean) => {
    setOpenNotes((entries) =>
      entries.map((entry) =>
        entry.note.id === noteId
          ? { ...entry, window: { ...entry.window, minimized } }
          : entry,
      ),
    );
  }, []);

  const handleNotePositionChange = useCallback(
    (noteId: string, position: { x: number; y: number }) => {
      setOpenNotes((entries) =>
        entries.map((entry) =>
          entry.note.id === noteId ? { ...entry, window: { ...entry.window, position } } : entry,
        ),
      );
    },
    [],
  );

  const handleNoteSizeChange = useCallback((noteId: string, size: NoteWindowSize) => {
    setOpenNotes((entries) =>
      entries.map((entry) =>
        entry.note.id === noteId ? { ...entry, window: { ...entry.window, size } } : entry,
      ),
    );
  }, []);

  const handleEntryChange = useCallback((noteId: string, patch: Partial<OpenNoteEntry>) => {
    setOpenNotes((entries) =>
      entries.map((entry) => (entry.note.id === noteId ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const handleNotesChange = useCallback((nextNotes: MarketJournalNote[]) => {
    setNotes(nextNotes);
    setOpenNotes((entries) =>
      entries.map((entry) => {
        const saved = nextNotes.find((note) => note.id === entry.note.id);
        if (!saved) return entry;
        return {
          ...entry,
          note: entry.isDirty
            ? { ...saved, title: entry.note.title, body: entry.note.body }
            : { ...saved },
        };
      }),
    );
  }, []);

  const toggleLibrary = useCallback(() => {
    if (libraryMinimized) {
      setLibraryMinimized(false);
      setLibraryOpen(true);
      setNotes(loadNotes());
      return;
    }
    if (!libraryOpen) {
      setLibraryOpen(true);
      setNotes(loadNotes());
    }
  }, [libraryMinimized, libraryOpen]);

  const handleLibraryOpenChange = useCallback((next: boolean) => {
    setLibraryOpen(next);
    if (!next) {
      setLibraryMinimized(false);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      libraryOpen,
      libraryMinimized,
      toggleLibrary,
    }),
    [libraryMinimized, libraryOpen, toggleLibrary],
  );

  return (
    <MarketJournalContext.Provider value={contextValue}>
      {children}

      <MarketJournalLibrary
        open={libraryOpen}
        minimized={libraryMinimized}
        openNoteIds={openNoteIds}
        onOpenChange={handleLibraryOpenChange}
        onMinimizedChange={setLibraryMinimized}
        onOpenNote={handleOpenNote}
      />

      {openNotes.map((entry) => (
        <MarketJournalFloatingNote
          key={entry.note.id}
          entry={entry}
          notes={notes}
          onEntryChange={handleEntryChange}
          onNotesChange={handleNotesChange}
          onClose={handleCloseNote}
          onMinimizeChange={handleNoteMinimizeChange}
          onPositionChange={handleNotePositionChange}
          onSizeChange={handleNoteSizeChange}
          onFocus={bringNoteToFront}
        />
      ))}
    </MarketJournalContext.Provider>
  );
}

export function MarketJournalButton() {
  const { libraryOpen, libraryMinimized, toggleLibrary } = useMarketJournalContext();

  return (
    <button
      type="button"
      onClick={toggleLibrary}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/80 px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent/60"
      aria-label="Open Market Journal"
      aria-pressed={libraryOpen || libraryMinimized}
    >
      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="hidden sm:inline">Market Journal</span>
      <span className="sm:hidden">Journal</span>
    </button>
  );
}
