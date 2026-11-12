import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

const active = Decoration.line({ class: "cm-follow-active" });

/** Marks the line the cursor is in. Whether the others are dimmed is a setting (see index.css). */
function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  builder.add(line.from, line.from, active);
  return builder.finish();
}

export const followLine: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate): void {
      if (u.selectionSet || u.docChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
