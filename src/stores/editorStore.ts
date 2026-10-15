import { create } from "zustand";
import type { PaneId } from "./workspaceStore";
import { useWorkspaceStore } from "./workspaceStore";

export type SaveStatus = "saved" | "saving" | "unsaved";

export interface Conflict {
  path: string;
  diskContent: string;
}

// Save status and conflicts are tracked per pane (tabs and split view). Every action takes the
// pane as its last argument and defaults to the primary pane.
interface EditorState {
  statuses: Record<PaneId, SaveStatus>;
  conflicts: Record<PaneId, Conflict | null>;
  /** The user typed; a write is pending. */
  markUnsaved: (pane?: PaneId) => void;
  /** A write started. */
  markSaving: (pane?: PaneId) => void;
  /** A write finished. `stillDirty` means more edits arrived meanwhile. */
  markSaved: (stillDirty?: boolean, pane?: PaneId) => void;
  setConflict: (c: Conflict | null, pane?: PaneId) => void;
  /** Resets one pane, or both when no pane is given. */
  reset: (pane?: PaneId) => void;
}

const initialStatuses: Record<PaneId, SaveStatus> = { primary: "saved", secondary: "saved" };
const initialConflicts: Record<PaneId, Conflict | null> = { primary: null, secondary: null };

export const useEditorStore = create<EditorState>((set) => ({
  statuses: initialStatuses,
  conflicts: initialConflicts,
  markUnsaved: (pane = "primary") => {
    set((s) => ({ statuses: { ...s.statuses, [pane]: "unsaved" } }));
  },
  markSaving: (pane = "primary") => {
    set((s) => ({ statuses: { ...s.statuses, [pane]: "saving" } }));
  },
  markSaved: (stillDirty = false, pane = "primary") => {
    set((s) => ({ statuses: { ...s.statuses, [pane]: stillDirty ? "unsaved" : "saved" } }));
  },
  setConflict: (conflict, pane = "primary") => {
    set((s) => ({ conflicts: { ...s.conflicts, [pane]: conflict } }));
  },
  reset: (pane) => {
    if (pane === undefined) {
      set({ statuses: initialStatuses, conflicts: initialConflicts });
      return;
    }
    set((s) => ({
      statuses: { ...s.statuses, [pane]: "saved" },
      conflicts: { ...s.conflicts, [pane]: null },
    }));
  },
}));

/** Save status of the focused pane (what the status bar shows). */
export function useFocusedSaveStatus(): SaveStatus {
  const focused = useWorkspaceStore((w) => w.layout.focused);
  return useEditorStore((s) => s.statuses[focused]);
}

export function saveStatusLabel(s: SaveStatus): string {
  switch (s) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving…";
    case "unsaved":
      return "Unsaved changes";
  }
}
