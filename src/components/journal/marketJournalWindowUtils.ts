export const NOTE_DEFAULT_WIDTH = 360;
export const NOTE_DEFAULT_HEIGHT = 380;
export const NOTE_MIN_WIDTH = 320;
export const NOTE_MIN_HEIGHT = 280;
export const NOTE_SIZE_SESSION_KEY = "market-journal-window-size";

export interface NoteWindowSize {
  width: number;
  height: number;
}

function getViewportMaxSize(position: { x: number; y: number }): NoteWindowSize {
  if (typeof window === "undefined") {
    return { width: 800, height: 720 };
  }

  return {
    width: Math.min(window.innerWidth - 32, window.innerWidth - position.x - 16),
    height: Math.min(window.innerHeight - 32, window.innerHeight - position.y - 16),
  };
}

export function clampNoteSize(
  width: number,
  height: number,
  position: { x: number; y: number },
): NoteWindowSize {
  const { width: maxWidth, height: maxHeight } = getViewportMaxSize(position);

  return {
    width: Math.min(Math.max(NOTE_MIN_WIDTH, width), Math.max(NOTE_MIN_WIDTH, maxWidth)),
    height: Math.min(Math.max(NOTE_MIN_HEIGHT, height), Math.max(NOTE_MIN_HEIGHT, maxHeight)),
  };
}

export function clampNotePosition(
  x: number,
  y: number,
  size: NoteWindowSize,
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };

  const maxX = Math.max(16, window.innerWidth - size.width - 16);
  const maxY = Math.max(16, window.innerHeight - size.height - 16);

  return {
    x: Math.min(Math.max(16, x), maxX),
    y: Math.min(Math.max(16, y), maxY),
  };
}

export function getDefaultNoteSize(): NoteWindowSize {
  if (typeof window === "undefined") {
    return { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT };
  }

  try {
    const raw = window.sessionStorage.getItem(NOTE_SIZE_SESSION_KEY);
    if (!raw) {
      return { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT };
    }

    const parsed = JSON.parse(raw) as Partial<NoteWindowSize>;
    if (typeof parsed.width !== "number" || typeof parsed.height !== "number") {
      return { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT };
    }

    return clampNoteSize(parsed.width, parsed.height, { x: 16, y: 96 });
  } catch {
    return { width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT };
  }
}

export function savePreferredNoteSize(size: NoteWindowSize) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(NOTE_SIZE_SESSION_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage failures.
  }
}

export function getDefaultNotePosition(index: number, size = getDefaultNoteSize()) {
  if (typeof window === "undefined") {
    return { x: 24 + index * 28, y: 96 + index * 32 };
  }

  const baseX = Math.max(16, window.innerWidth - size.width - 48);
  const baseY = 96;
  return clampNotePosition(baseX - index * 28, baseY + index * 32, size);
}

export type NoteResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

function clampNoteWidth(width: number, position: { x: number; y: number }, height: number): number {
  const { width: maxWidth } = getViewportMaxSize(position);
  return Math.min(Math.max(NOTE_MIN_WIDTH, width), Math.max(NOTE_MIN_WIDTH, maxWidth));
}

function clampNoteHeight(height: number, position: { x: number; y: number }, width: number): number {
  const { height: maxHeight } = getViewportMaxSize(position);
  return Math.min(Math.max(NOTE_MIN_HEIGHT, height), Math.max(NOTE_MIN_HEIGHT, maxHeight));
}

/** @deprecated Use NoteResizeHandle */
export type NoteResizeCorner = Extract<NoteResizeHandle, "nw" | "ne" | "sw" | "se">;

export function resizeNoteFromHandle(
  handle: NoteResizeHandle,
  origin: {
    position: { x: number; y: number };
    size: NoteWindowSize;
  },
  delta: { x: number; y: number },
): { position: { x: number; y: number }; size: NoteWindowSize } {
  const right = origin.position.x + origin.size.width;
  const bottom = origin.position.y + origin.size.height;

  switch (handle) {
    case "e": {
      const width = clampNoteWidth(origin.size.width + delta.x, origin.position, origin.size.height);
      const size = { width, height: origin.size.height };
      return {
        position: clampNotePosition(origin.position.x, origin.position.y, size),
        size,
      };
    }
    case "w": {
      const width = clampNoteWidth(origin.size.width - delta.x, origin.position, origin.size.height);
      const x = right - width;
      const size = { width, height: origin.size.height };
      return {
        position: clampNotePosition(x, origin.position.y, size),
        size,
      };
    }
    case "s": {
      const height = clampNoteHeight(origin.size.height + delta.y, origin.position, origin.size.width);
      const size = { width: origin.size.width, height };
      return {
        position: clampNotePosition(origin.position.x, origin.position.y, size),
        size,
      };
    }
    case "n": {
      const height = clampNoteHeight(origin.size.height - delta.y, origin.position, origin.size.width);
      const y = bottom - height;
      const size = { width: origin.size.width, height };
      return {
        position: clampNotePosition(origin.position.x, y, size),
        size,
      };
    }
    default:
      break;
  }

  let width: number;
  let height: number;
  let x: number;
  let y: number;

  switch (handle) {
    case "se":
      width = origin.size.width + delta.x;
      height = origin.size.height + delta.y;
      x = origin.position.x;
      y = origin.position.y;
      break;
    case "sw":
      width = origin.size.width - delta.x;
      height = origin.size.height + delta.y;
      x = right - width;
      y = origin.position.y;
      break;
    case "ne":
      width = origin.size.width + delta.x;
      height = origin.size.height - delta.y;
      x = origin.position.x;
      y = bottom - height;
      break;
    case "nw":
      width = origin.size.width - delta.x;
      height = origin.size.height - delta.y;
      x = right - width;
      y = bottom - height;
      break;
    default:
      return { position: origin.position, size: origin.size };
  }

  let size = clampNoteSize(width, height, { x, y });

  switch (handle) {
    case "se":
      x = origin.position.x;
      y = origin.position.y;
      break;
    case "sw":
      x = right - size.width;
      y = origin.position.y;
      break;
    case "ne":
      x = origin.position.x;
      y = bottom - size.height;
      break;
    case "nw":
      x = right - size.width;
      y = bottom - size.height;
      break;
    default:
      break;
  }

  size = clampNoteSize(size.width, size.height, { x, y });
  const position = clampNotePosition(x, y, size);

  return { position, size };
}

export function resizeNoteFromCorner(
  corner: NoteResizeCorner,
  origin: {
    position: { x: number; y: number };
    size: NoteWindowSize;
  },
  delta: { x: number; y: number },
): { position: { x: number; y: number }; size: NoteWindowSize } {
  return resizeNoteFromHandle(corner, origin, delta);
}
