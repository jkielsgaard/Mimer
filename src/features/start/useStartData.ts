import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { isManagedNote } from "@/features/fileTree/treeUtils";
import { api } from "@/lib/api";
import { modifiedByPath, noteExcerpt, noteKind, PINNED_TAG, type NoteKind } from "@/lib/startPage";
import { noteTitle } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meetingStore";
import { useRecent } from "@/stores/recentStore";
import { useTaskStore } from "@/stores/taskStore";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** The notes opened lately (newest first), when each was changed and what kind each is. */
export function useRecentNotes(): {
  notes: string[];
  modified: Map<string, number>;
  kindOf: (path: string) => NoteKind;
} {
  const recent = useRecent((s) => s.paths);
  const tree = useVaultStore((s) => s.tree);
  const meetings = useMeetingStore((s) => s.meetings);
  const epics = useTaskStore((s) => s.epics);
  const modified = useMemo(() => modifiedByPath(tree), [tree]);
  const meetingPaths = useMemo(() => new Set(meetings.map((m) => m.path)), [meetings]);
  const epicPaths = useMemo(() => new Set(epics.map((e) => e.path)), [epics]);
  const notes = useMemo(
    () => recent.filter((p) => !isManagedNote(p) && modified.has(p)),
    [recent, modified],
  );
  const kindOf = useCallback(
    (p: string) => noteKind(p, meetingPaths, epicPaths),
    [meetingPaths, epicPaths],
  );
  return { notes, modified, kindOf };
}

interface PinState {
  paths: string[];
  load: () => Promise<void>;
}

/** The notes with the tag `pinned`, by name. One read at a time; the start page asks for it. */
export const usePinStore = create<PinState>((set) => {
  let running: Promise<void> | null = null;
  let again = false;
  /** Read through a function: TypeScript would otherwise think `again` is still false. */
  const askedAgain = (): boolean => again;
  return {
    paths: [],
    load: () => {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          try {
            const notes = await api.taggedNotes(PINNED_TAG);
            set({
              paths: notes
                .map((x) => x.path)
                .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b))),
            });
          } catch {
            set({ paths: [] });
          }
        } while (askedAgain());
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
});

/** Reads the pinned notes when the start page opens and again when the notes change. */
export function usePinnedLoaded(): void {
  const files = useVaultStore((s) => s.files);
  const nonce = useVaultStore((s) => s.reloadNonce);
  useEffect(() => {
    void usePinStore.getState().load();
  }, [files, nonce]);
}

/** The pinned notes, and a way to unpin one. */
export function usePinned(): { paths: string[]; unpin: (path: string) => void } {
  const paths = usePinStore((s) => s.paths);
  const unpin = useCallback((path: string): void => {
    api
      .noteSetTag(path, PINNED_TAG, false)
      .then(() => {
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
        return usePinStore.getState().load();
      })
      .catch(reportError);
  }, []);
  return { paths, unpin };
}

/** The start of what is in a note, read for the Continue card. */
export function useExcerpt(path: string | null): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (path === null) {
      setText("");
      return;
    }
    let live = true;
    Promise.resolve()
      .then(() => api.readNote(path))
      .then((n) => {
        if (live) setText(noteExcerpt(n.content));
      })
      .catch(() => {
        if (live) setText("");
      });
    return () => {
      live = false;
    };
  }, [path]);
  return text;
}
