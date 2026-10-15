import { create } from "zustand";
import { safeStorage } from "@/lib/safeStorage";

/** How many recent notes are remembered. The list shows as many as the setting allows (at most this). */
export const MAX_RECENT = 20;

const PREFIX = "mimer-recent:";

function read(vaultPath: string): string[] {
  try {
    const parsed: unknown = JSON.parse(safeStorage.getItem(PREFIX + vaultPath) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

interface RecentState {
  vaultPath: string | null;
  /** Newest first. */
  paths: string[];
  /** Loads the list of a vault, dropping notes that no longer exist. */
  load: (vaultPath: string, existing: readonly string[]) => void;
  push: (path: string) => void;
  /** A note or folder was renamed. */
  rename: (from: string, to: string) => void;
  /** A note or folder (and everything in it) was deleted. */
  remove: (path: string) => void;
  reset: () => void;
}

/** The notes opened last in this vault, newest first, remembered per vault on this computer. */
export const useRecent = create<RecentState>((set, get) => {
  const save = (paths: string[]): void => {
    const { vaultPath } = get();
    if (vaultPath !== null) safeStorage.setItem(PREFIX + vaultPath, JSON.stringify(paths));
    set({ paths });
  };
  return {
    vaultPath: null,
    paths: [],
    load: (vaultPath, existing) => {
      const have = new Set(existing);
      set({ vaultPath, paths: read(vaultPath).filter((p) => have.has(p)) });
    },
    push: (path) => {
      save([path, ...get().paths.filter((p) => p !== path)].slice(0, MAX_RECENT));
    },
    rename: (from, to) => {
      const renamed = get().paths.map((p) =>
        p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p,
      );
      // The new name may already be in the list (opening it counts as a visit): keep the first.
      save([...new Set(renamed)]);
    },
    remove: (path) => {
      save(get().paths.filter((p) => p !== path && !p.startsWith(`${path}/`)));
    },
    reset: () => {
      set({ vaultPath: null, paths: [] });
    },
  };
});
