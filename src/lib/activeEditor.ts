import type { EditorView } from "@codemirror/view";

interface Active {
  view: EditorView;
  notePath: () => string | null;
}

let active: Active | null = null;

/** Remembers the editor the user last clicked in, so other panels can insert text into it. */
export function setActiveEditor(view: EditorView, notePath: () => string | null): void {
  active = { view, notePath };
}

/** The last editor that had focus and is still on screen, with the note it shows. */
export function getActiveEditor(): { view: EditorView; notePath: string } | null {
  if (active === null || !active.view.dom.isConnected) return null;
  const notePath = active.notePath();
  return notePath === null ? null : { view: active.view, notePath };
}
