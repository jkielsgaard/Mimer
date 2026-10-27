import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * The tags in the properties of a note, and a way to put one on or take it off. The note is
 * read again when it is opened or reloaded.
 */
export function useNoteTags(path: string | null): {
  tags: readonly string[];
  setTag: (tag: string, on: boolean) => Promise<void>;
} {
  const [tags, setTags] = useState<readonly string[]>([]);
  const nonce = useVaultStore((s) => s.reloadNonce);

  useEffect(() => {
    if (path === null) {
      setTags([]);
      return;
    }
    let live = true;
    Promise.resolve()
      .then(() => api.noteTags(path))
      .then((t) => {
        if (live) setTags(t);
      })
      .catch(() => {
        if (live) setTags([]);
      });
    return () => {
      live = false;
    };
  }, [path, nonce]);

  const setTag = useCallback(
    async (tag: string, on: boolean): Promise<void> => {
      if (path === null) return;
      try {
        await flushPendingWrites();
        setTags(await api.noteSetTag(path, tag, on));
        // The editor shows the file as it is now.
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      } catch (e) {
        reportError(e);
      }
    },
    [path],
  );

  return { tags, setTag };
}
