import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { focusedView } from "@/lib/editorViews";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * The text of the open note: what is in the editor, read again each time the note is saved.
 * Right after another note is opened the editor may still hold the previous one (it loads the new
 * note a moment later), so the first read of a note is from the file on disk, as it is when no
 * editor shows it.
 */
export function useNoteText(): { path: string | null; text: string } {
  const path = useVaultStore((s) => s.activePath);
  const pane = useWorkspaceStore((s) => s.layout.focused);
  const status = useEditorStore((s) => s.statuses[pane]);
  const reload = useVaultStore((s) => s.reloadNonce);
  const [text, setText] = useState("");
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const fresh = shown.current !== path;
    shown.current = path;
    if (path === null) {
      setText("");
      return;
    }
    const view = focusedView();
    if (view && !fresh) {
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
