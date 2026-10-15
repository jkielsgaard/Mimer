import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { emptyTable, serializeTable } from "@/lib/markdownTable";

/**
 * Toggles a symmetric Markdown marker (`**`, `_`, `~~`, `` ` ``) around the selection.
 * Whitespace and line breaks at the ends of the selection (a triple-click selects the line break)
 * stay outside the marker, because `**text\n**` is not valid Markdown.
 */
export function toggleWrap(view: EditorView, marker: string): boolean {
  const { state } = view;
  const len = marker.length;
  view.dispatch(
    state.changeByRange((range) => {
      let { from, to } = range;
      if (!range.empty) {
        while (from < to && /\s/.test(state.doc.sliceString(from, from + 1))) from++;
        while (to > from && /\s/.test(state.doc.sliceString(to - 1, to))) to--;
      }
      const before = state.doc.sliceString(Math.max(0, from - len), from);
      const after = state.doc.sliceString(to, to + len);
      if (from < to && before === marker && after === marker) {
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(from - len, to - len),
        };
      }
      if (from === to) {
        return {
          changes: { from, insert: marker + marker },
          range: EditorSelection.cursor(from + len),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + len, to + len),
      };
    }),
  );
  return true;
}

/** Inserts an empty table (3 columns, 2 body rows) on its own line at the cursor. */
export function insertTable(view: EditorView, cols = 3, rows = 2): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const table = serializeTable(emptyTable(cols, rows));
  const lineStart = state.doc.lineAt(sel.from).from;
  const needsBreakBefore = sel.from !== lineStart;
  const insert = `${needsBreakBefore ? "\n" : ""}${table}\n`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  return true;
}
