import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { focusedView } from "@/lib/editorViews";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * The text of the open note: what is in the editor, read again each time the note is saved.
 * Falls back to the file on disk when no editor shows it.
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
    const view = focusedView();
    if (view) {
      setText(view.state.doc.toString());
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
