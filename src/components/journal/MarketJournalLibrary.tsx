import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Minus, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createDraftNote,
  isJournalStorageAvailable,
  loadNotes,
  type MarketJournalNote,
} from "@/lib/journal/marketJournalStorage";
import {
  filterNotes,
  formatNoteTime,
  getBodyPreview,
  getDisplayTitle,
  groupNotesByDate,
} from "@/lib/journal/marketJournalUtils";
import { cn } from "@/lib/utils";

const LIBRARY_WIDTH = 420;
const LIBRARY_HEIGHT_VH = 65;
const DEFAULT_TOP = 80;
const DEFAULT_RIGHT = 24;

interface MarketJournalLibraryProps {
  open: boolean;
  minimized: boolean;
  openNoteIds: string[];
  onOpenChange: (open: boolean) => void;
  onMinimizedChange: (minimized: boolean) => void;
  onOpenNote: (note: MarketJournalNote) => void;
}

function getDefaultLibraryPosition() {
  if (typeof window === "undefined") {
    return { x: DEFAULT_RIGHT, y: DEFAULT_TOP };
  }
  return {
    x: Math.max(16, window.innerWidth - LIBRARY_WIDTH - DEFAULT_RIGHT),
    y: DEFAULT_TOP,
  };
}

export function MarketJournalLibrary({
  open,
  minimized,
  openNoteIds,
  onOpenChange,
  onMinimizedChange,
  onOpenNote,
}: MarketJournalLibraryProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState(getDefaultLibraryPosition);
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<MarketJournalNote[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const filteredNotes = useMemo(
    () => filterNotes(notes, searchQuery),
    [notes, searchQuery],
  );
  const groupedNotes = useMemo(() => groupNotesByDate(filteredNotes), [filteredNotes]);
  const openNoteIdSet = useMemo(() => new Set(openNoteIds), [openNoteIds]);

  const reloadNotes = useCallback(() => {
    setStorageAvailable(isJournalStorageAvailable());
    setNotes(loadNotes());
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (open && !minimized) reloadNotes();
  }, [open, minimized, reloadNotes]);

  const handleClose = () => {
    onOpenChange(false);
    onMinimizedChange(false);
  };

  const handleNewNote = () => {
    onOpenNote(createDraftNote());
    onOpenChange(false);
    onMinimizedChange(false);
  };

  const handleOpenExisting = (note: MarketJournalNote) => {
    onOpenNote({ ...note });
    onOpenChange(false);
    onMinimizedChange(false);
  };

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const maxX = Math.max(16, window.innerWidth - LIBRARY_WIDTH - 16);
    const maxY = Math.max(16, window.innerHeight - 160);
    return {
      x: Math.min(Math.max(16, x), maxX),
      y: Math.min(Math.max(16, y), maxY),
    };
  }, []);

  const handleHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    if ((event.target as HTMLElement).closest("button")) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(
      clampPosition(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
      ),
    );
  };

  const handleHeaderPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!open || minimized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, minimized]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      {!minimized ? (
        <div
          role="dialog"
          aria-label="Market Journal Library"
          aria-modal="false"
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden border border-border bg-card shadow-[0_12px_48px_rgba(0,0,0,0.45)] pointer-events-auto",
            isMobile ? "inset-x-3 bottom-3 top-16 rounded-lg" : "rounded-lg",
          )}
          style={
            isMobile
              ? undefined
              : {
                  left: position.x,
                  top: position.y,
                  width: LIBRARY_WIDTH,
                  maxWidth: "calc(100vw - 2rem)",
                  height: `${LIBRARY_HEIGHT_VH}vh`,
                }
          }
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3",
              !isMobile && "cursor-grab active:cursor-grabbing",
            )}
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
          >
            <div className="min-w-0 select-none">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                Market Journal
              </h2>
              <p className="text-[11px] text-muted-foreground">Browse and open notes</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={handleNewNote}>
                <Plus className="h-3.5 w-3.5" />
                New note
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onMinimizedChange(true)}
                aria-label="Minimize Market Journal library"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleClose}
                aria-label="Close Market Journal library"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!storageAvailable && (
            <div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
              Notes cannot be saved — local storage is unavailable in this browser.
            </div>
          )}

          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notes…"
                className="h-8 pl-8 text-[12px]"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {notes.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                No journal notes yet. Create your first market thought.
              </p>
            ) : groupedNotes.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                No notes match your search.
              </p>
            ) : (
              <div className="px-2 py-2">
                {groupedNotes.map((group) => (
                  <div key={group.dateKey} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {group.label}
                    </div>
                    <ul className="space-y-0.5">
                      {group.notes.map((note) => {
                        const isOpen = openNoteIdSet.has(note.id);
                        return (
                          <li key={note.id}>
                            <button
                              type="button"
                              onClick={() => handleOpenExisting(note)}
                              className={cn(
                                "w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50",
                                isOpen && "ring-1 ring-primary/40",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="truncate text-[12px] font-medium text-foreground">
                                  {getDisplayTitle(note)}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {formatNoteTime(note.updatedAt)}
                                </span>
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                {getBodyPreview(note.body)}
                              </p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onMinimizedChange(false)}
          className="fixed bottom-6 right-6 z-[60] inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-[11px] font-medium text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur pointer-events-auto transition-colors hover:bg-accent/60"
          aria-label="Restore Market Journal library"
        >
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          Journal
        </button>
      )}
    </>,
    document.body,
  );
}
