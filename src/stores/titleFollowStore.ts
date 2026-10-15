import { create } from "zustand";

interface TitleFollowState {
  /** Notes whose file name follows the first heading. */
  paths: ReadonlySet<string>;
  start: (path: string) => void;
  stop: (path: string) => void;
  has: (path: string) => boolean;
  /** A note was renamed. `following` is true when the rename came from the title itself. */
  onRenamed: (from: string, to: string, following: boolean) => void;
  onDeleted: (path: string) => void;
  reset: () => void;
}

/** Which new notes are named after the title the user types. Kept in memory only. */
export const useTitleFollow = create<TitleFollowState>((set, get) => ({
  paths: new Set(),
  start: (path) => {
    set({ paths: new Set(get().paths).add(path) });
  },
  stop: (path) => {
    const next = new Set(get().paths);
    next.delete(path);
    set({ paths: next });
  },
  has: (path) => get().paths.has(path),
  onRenamed: (from, to, following) => {
    const next = new Set(get().paths);
    const was = next.delete(from);
    if (was && following) next.add(to);
    set({ paths: next });
  },
  onDeleted: (path) => {
    get().stop(path);
  },
  reset: () => {
    set({ paths: new Set() });
  },
}));
