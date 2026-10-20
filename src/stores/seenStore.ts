import { create } from "zustand";
import { safeStorage } from "@/lib/safeStorage";

const KEY = "mimer.seenNotes";
const MAX = 500;

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(safeStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** A note counts as new for a week after it was last changed, until it has been opened. */
export const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;

interface SeenState {
  paths: string[];
  /** The note was opened: it is no longer new. */
  mark: (path: string) => void;
  /** A note was renamed or moved. */
  rename: (from: string, to: string) => void;
}

/** The notes that have been opened at least once on this computer. */
export const useSeen = create<SeenState>((set, get) => ({
  paths: read(),
  mark: (path) => {
    if (get().paths.includes(path)) return;
    const paths = [path, ...get().paths].slice(0, MAX);
    safeStorage.setItem(KEY, JSON.stringify(paths));
    set({ paths });
  },
  rename: (from, to) => {
    const paths = get().paths.map((p) => (p === from ? to : p));
    safeStorage.setItem(KEY, JSON.stringify(paths));
    set({ paths });
  },
}));

/** Whether a note (changed at `modified`, milliseconds since 1970) is new and not yet opened. */
export function isNewNote(
  path: string,
  modified: number,
  seen: readonly string[],
  now = Date.now(),
): boolean {
  return modified > 0 && now - modified < NEW_FOR_MS && !seen.includes(path);
}
