import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * The text of the open note as it is saved, read again each time the note is saved or rewritten.
 * It is read from the file rather than from the editor: right after another note is opened the
 * editor can still hold the previous one, and the saved text is what the panels describe.
 */
export function useNoteText(): { path: string | null; text: string } {
  const path = useVaultStore((s) => s.activePath);
  const pane = useWorkspaceStore((s) => s.layout.focused);
  const status = useEditorStore((s) => s.statuses[pane]);
  const reload = useVaultStore((s) => s.reloadNonce);
  const [text, setText] = useState("");
  useEffect(() => {
    if (path === null) {
      setText("");
      return;
    }
    let alive = true;
    api
      .readNote(path)
      .then((n) => {
        if (alive) setText(n.content);
      })
      .catch(() => {
        if (alive) setText("");
      });
    return () => {
      alive = false;
    };
  }, [path, status, reload]);
  return { path, text };
}
