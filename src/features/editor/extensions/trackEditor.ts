import { EditorView } from "@codemirror/view";
import { setActiveEditor } from "@/lib/activeEditor";

/** Tells `lib/activeEditor` which editor was used last (several panes can be open). */
export function trackEditor(getNotePath: () => string | null) {
  return EditorView.domEventHandlers({
    focus(_event, view) {
      setActiveEditor(view, getNotePath);
      return false;
    },
  });
}
