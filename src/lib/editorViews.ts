import type { EditorView } from "@codemirror/view";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";

const views = new Map<PaneId, EditorView>();

/** Remembers the editor of a pane (or forgets it with `null`), so panels can reach it. */
export function registerView(pane: PaneId, view: EditorView | null): void {
  if (view === null) views.delete(pane);
  else views.set(pane, view);
}

/** The editor of the pane that has the focus, if it is open. */
export function focusedView(): EditorView | null {
  const pane = useWorkspaceStore.getState().layout.focused;
  return views.get(pane) ?? views.get("primary") ?? null;
}

/** Moves the cursor of the focused editor to the start of a line (0-based) and shows it. */
export function goToLine(line: number): void {
  const view = focusedView();
  if (!view) return;
  const n = Math.min(Math.max(1, line + 1), view.state.doc.lines);
  const pos = view.state.doc.line(n).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}
