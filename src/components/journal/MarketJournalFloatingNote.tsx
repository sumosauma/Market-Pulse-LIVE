import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Minus, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteNote,
  isJournalStorageAvailable,
  isPersistedNote,
  normalizeNoteInput,
  saveNotes,
  updateNote,
  type MarketJournalNote,
} from "@/lib/journal/marketJournalStorage";
import { formatNoteTimestamp, getDisplayTitle } from "@/lib/journal/marketJournalUtils";
import { cn } from "@/lib/utils";

import type { OpenNoteEntry } from "./MarketJournalProvider";
import {
  clampNotePosition,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  resizeNoteFromHandle,
  savePreferredNoteSize,
  type NoteResizeHandle,
  type NoteWindowSize,
} from "./marketJournalWindowUtils";

const AUTOSAVE_MS = 1500;
const CORNER_HIT_SIZE = 14;
const EDGE_HIT_SIZE = 8;

const NOTE_CORNERS: {
  handle: NoteResizeHandle;
  className: string;
  label: string;
}[] = [
  { handle: "nw", className: "left-0 top-0 cursor-nwse-resize", label: "Resize top left" },
  { handle: "ne", className: "right-0 top-0 cursor-nesw-resize", label: "Resize top right" },
  { handle: "sw", className: "bottom-0 left-0 cursor-nesw-resize", label: "Resize bottom left" },
  { handle: "se", className: "bottom-0 right-0 cursor-nwse-resize", label: "Resize bottom right" },
];

const NOTE_EDGES: {
  handle: NoteResizeHandle;
  className: string;
  label: string;
  style: CSSProperties;
}[] = [
  {
    handle: "n",
    className: "left-0 right-0 top-0 cursor-ns-resize",
    label: "Resize top",
    style: {
      left: CORNER_HIT_SIZE,
      right: CORNER_HIT_SIZE,
      height: EDGE_HIT_SIZE,
    },
  },
  {
    handle: "s",
    className: "bottom-0 cursor-ns-resize",
    label: "Resize bottom",
    style: {
      left: CORNER_HIT_SIZE,
      right: CORNER_HIT_SIZE,
      bottom: 0,
      height: EDGE_HIT_SIZE,
    },
  },
  {
    handle: "w",
    className: "left-0 cursor-ew-resize",
    label: "Resize left",
    style: {
      top: CORNER_HIT_SIZE,
      bottom: CORNER_HIT_SIZE,
      left: 0,
      width: EDGE_HIT_SIZE,
    },
  },
  {
    handle: "e",
    className: "right-0 cursor-ew-resize",
    label: "Resize right",
    style: {
      top: CORNER_HIT_SIZE,
      bottom: CORNER_HIT_SIZE,
      right: 0,
      width: EDGE_HIT_SIZE,
    },
  },
];

export type NoteSaveStatus = "idle" | "saved" | "saving";

export interface NoteWindowState {
  noteId: string;
  position: { x: number; y: number };
  size: NoteWindowSize;
  minimized: boolean;
  zIndex: number;
}

interface MarketJournalFloatingNoteProps {
  entry: OpenNoteEntry;
  notes: MarketJournalNote[];
  onEntryChange: (noteId: string, patch: Partial<OpenNoteEntry>) => void;
  onNotesChange: (notes: MarketJournalNote[]) => void;
  onClose: (noteId: string) => void;
  onMinimizeChange: (noteId: string, minimized: boolean) => void;
  onPositionChange: (noteId: string, position: { x: number; y: number }) => void;
  onSizeChange: (noteId: string, size: NoteWindowSize) => void;
  onFocus: (noteId: string) => void;
}

export function MarketJournalFloatingNote({
  entry,
  notes,
  onEntryChange,
  onNotesChange,
  onClose,
  onMinimizeChange,
  onPositionChange,
  onSizeChange,
  onFocus,
}: MarketJournalFloatingNoteProps) {
  const { note: editingNote, window: windowState, isDirty, saveStatus } = entry;
  const noteSize = windowState.size ?? {
    width: NOTE_DEFAULT_WIDTH,
    height: NOTE_DEFAULT_HEIGHT,
  };
  const [isMobile, setIsMobile] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    handle: NoteResizeHandle;
    originPosition: { x: number; y: number };
    originSize: NoteWindowSize;
  } | null>(null);

  const isNewDraft = useMemo(
    () => !isPersistedNote(notes, editingNote),
    [editingNote, notes],
  );

  const headerTitle = getDisplayTitle(editingNote);

  useEffect(() => {
    setStorageAvailable(isJournalStorageAvailable());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const persistNote = useCallback(() => {
    if (!storageAvailable) return false;

    const normalized = normalizeNoteInput(editingNote);
    const isNew = !isPersistedNote(notes, editingNote);

    let nextNotes: MarketJournalNote[];
    let savedNote: MarketJournalNote;

    if (isNew) {
      savedNote = {
        ...editingNote,
        ...normalized,
        updatedAt: new Date().toISOString(),
      };
      nextNotes = [savedNote, ...notes];
    } else {
      nextNotes = updateNote(notes, editingNote.id, normalized);
      savedNote = nextNotes.find((item) => item.id === editingNote.id) ?? {
        ...editingNote,
        ...normalized,
      };
    }

    onNotesChange(nextNotes);
    saveNotes(nextNotes);
    onEntryChange(editingNote.id, {
      note: { ...savedNote },
      isDirty: false,
      saveStatus: "saved",
    });
    return true;
  }, [editingNote, notes, onEntryChange, onNotesChange, storageAvailable]);

  const handleSave = () => {
    onEntryChange(editingNote.id, { saveStatus: "saving" });
    persistNote();
  };

  useEffect(() => {
    if (!isDirty || !storageAvailable) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      onEntryChange(editingNote.id, { saveStatus: "saving" });
      persistNote();
    }, AUTOSAVE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [editingNote, isDirty, onEntryChange, persistNote, storageAvailable]);

  const updateDraft = (patch: Partial<Pick<MarketJournalNote, "title" | "body">>) => {
    onEntryChange(editingNote.id, {
      note: { ...editingNote, ...patch },
      isDirty: true,
      saveStatus: "idle",
    });
  };

  const requestClose = useCallback(() => {
    if (isDirty) {
      setUnsavedDialogOpen(true);
      return;
    }
    onClose(editingNote.id);
  }, [editingNote.id, isDirty, onClose]);

  const handleDelete = () => {
    if (isNewDraft || !storageAvailable) {
      onClose(editingNote.id);
      setDeleteDialogOpen(false);
      return;
    }

    const nextNotes = deleteNote(notes, editingNote.id);
    onNotesChange(nextNotes);
    saveNotes(nextNotes);
    setDeleteDialogOpen(false);
    onClose(editingNote.id);
  };

  const handleHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    onFocus(editingNote.id);
    if (isMobile) return;
    if ((event.target as HTMLElement).closest("button")) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: windowState.position.x,
      originY: windowState.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    onPositionChange(
      editingNote.id,
      clampNotePosition(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
        noteSize,
      ),
    );
  };

  const handleHeaderPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: NoteResizeHandle,
  ) => {
    event.stopPropagation();
    onFocus(editingNote.id);

    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      handle,
      originPosition: { ...windowState.position },
      originSize: { ...noteSize },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const next = resizeNoteFromHandle(
      resize.handle,
      {
        position: resize.originPosition,
        size: resize.originSize,
      },
      {
        x: event.clientX - resize.startX,
        y: event.clientY - resize.startY,
      },
    );

    onPositionChange(editingNote.id, next.position);
    onSizeChange(editingNote.id, next.size);
    savePreferredNoteSize(next.size);
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (windowState.minimized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [windowState.minimized, requestClose]);

  const canSave = storageAvailable && (isNewDraft || isDirty);
  const statusLabel =
    saveStatus === "saved"
      ? `Saved · ${formatNoteTimestamp(editingNote.updatedAt)}`
      : saveStatus === "saving"
        ? "Saving…"
        : isDirty
          ? "Unsaved"
          : isNewDraft
            ? "New note"
            : formatNoteTimestamp(editingNote.updatedAt);

  if (typeof document === "undefined") return null;

  const panel = windowState.minimized ? (
    <button
      type="button"
      onClick={() => onMinimizeChange(editingNote.id, false)}
      style={{ left: windowState.position.x, top: windowState.position.y, zIndex: windowState.zIndex }}
      className="fixed inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-[0_6px_24px_rgba(0,0,0,0.3)] backdrop-blur pointer-events-auto transition-colors hover:bg-accent/60"
      aria-label={`Restore note: ${headerTitle}`}
    >
      <span className="truncate">{headerTitle}</span>
    </button>
  ) : (
    <div
      role="dialog"
      aria-label={`Note: ${headerTitle}`}
      aria-modal="false"
      onPointerDown={() => onFocus(editingNote.id)}
      className={cn(
        "fixed flex flex-col overflow-hidden rounded-lg border border-border/90 bg-card shadow-[0_10px_40px_rgba(0,0,0,0.4)] pointer-events-auto",
        isMobile && "inset-x-4 bottom-4 top-auto max-h-[min(420px,70vh)]",
      )}
      style={
        isMobile
          ? { zIndex: windowState.zIndex }
          : {
              left: windowState.position.x,
              top: windowState.position.y,
              width: noteSize.width,
              height: noteSize.height,
              zIndex: windowState.zIndex,
            }
      }
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2",
          !isMobile && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <div className="min-w-0 flex-1 select-none">
          <p className="truncate text-[12px] font-semibold text-foreground">{headerTitle}</p>
          <p className="truncate text-[10px] text-muted-foreground">{statusLabel}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={() => onMinimizeChange(editingNote.id, true)}
          aria-label="Minimize note"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        {!isNewDraft ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
            aria-label="Delete note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={requestClose}
          aria-label="Close note"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!storageAvailable && (
        <div className="shrink-0 bg-destructive/10 px-3 py-1.5 text-[10px] text-destructive">
          Storage unavailable — note cannot be saved.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <Input
          value={editingNote.title}
          onChange={(event) => updateDraft({ title: event.target.value })}
          placeholder="Title"
          className="mb-2 h-8 border-0 bg-transparent px-0 text-[13px] font-medium shadow-none focus-visible:ring-0"
        />
        <Textarea
          value={editingNote.body}
          onChange={(event) => updateDraft({ body: event.target.value })}
          placeholder="Write your market thoughts…"
          className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 py-0 text-[12px] leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex justify-end border-t border-border/70 pt-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </div>
      </div>

      {!isMobile ? (
        <>
          {NOTE_EDGES.map(({ handle, className, label, style }) => (
            <div
              key={handle}
              aria-label={label}
              className={cn("absolute z-10 touch-none", className)}
              style={style}
              onPointerDown={(event) => handleResizePointerDown(event, handle)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />
          ))}
          {NOTE_CORNERS.map(({ handle, className, label }) => (
            <div
              key={handle}
              aria-label={label}
              className={cn("absolute z-20 touch-none", className)}
              style={{ width: CORNER_HIT_SIZE, height: CORNER_HIT_SIZE }}
              onPointerDown={(event) => handleResizePointerDown(event, handle)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />
          ))}
        </>
      ) : null}
    </div>
  );

  return createPortal(
    <>
      {panel}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the note from your Market Journal. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unsavedDialogOpen} onOpenChange={setUnsavedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits in this note. Save before closing, or discard to close.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUnsavedDialogOpen(false);
                onClose(editingNote.id);
              }}
            >
              Discard
            </Button>
            <AlertDialogAction
              onClick={() => {
                persistNote();
                setUnsavedDialogOpen(false);
                onClose(editingNote.id);
              }}
            >
              Save & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body,
  );
}
