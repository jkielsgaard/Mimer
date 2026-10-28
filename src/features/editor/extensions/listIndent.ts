import { Prec } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

import { isInlineTab, LIST_LINE, PLAIN_STEP } from "@/lib/indentText";

interface ListLine {
  from: number;
  indent: number;
  /** How far an item moves in or out: as wide as its marker and the space after it. */
  step: number;
  /** The line has nothing after the marker (and checkbox). */
  empty: boolean;
  /** The line is a list item. */
  list: boolean;
}

/** The lines the selection touches; a list item moves by its marker, any other line by two spaces. */
function listLines(view: EditorView): ListLine[] {
  const { state } = view;
  const found: ListLine[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number;
    for (let n = state.doc.lineAt(r.from).number; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = LIST_LINE.exec(line.text);
      if (!m) {
        found.push({
          from: line.from,
          indent: (/^[ \t]*/.exec(line.text)?.[0] ?? "").length,
          step: PLAIN_STEP,
          empty: line.text.trim() === "",
          list: false,
        });
        continue;
      }
      found.push({
        from: line.from,
        indent: (m[1] ?? "").length,
        step: Math.max(2, (m[2] ?? "").length + 1),
        empty: line.text.slice(m[0].length).trim() === "",
        list: true,
      });
    }
  }
  return found;
}

/** The caret, when it is after some text on a line that is not a list item (Tab puts a tab there). */
function inlineAt(view: EditorView): number | null {
  const { state } = view;
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return null;
  const line = state.doc.lineAt(sel.main.head);
  return isInlineTab(line.text, sel.main.head - line.from) ? sel.main.head : null;
}

/** Moves the lines under the selection one level in: list items by their marker, others by two spaces. */
export function indentList(view: EditorView): boolean {
  if (inlineAt(view) !== null) {
    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: "\t" },
      selection: { anchor: head + 1 },
      userEvent: "input",
    });
    return true;
  }
  const lines = listLines(view);
  if (lines.length === 0) return false;
  view.dispatch({
    changes: lines.map((l) => ({ from: l.from, insert: " ".repeat(l.step) })),
    userEvent: "input.indent",
  });
  return true;
}

/**
 * Moves the lines under the selection one level out. A line already at the left edge stays (the
 * key is still used, so focus does not jump).
 */
export function outdentList(view: EditorView): boolean {
  const inline = inlineAt(view);
  if (inline !== null && view.state.doc.sliceString(inline - 1, inline) === "\t") {
    view.dispatch({ changes: { from: inline - 1, to: inline }, userEvent: "delete.dedent" });
    return true;
  }
  const lines = listLines(view);
  if (lines.length === 0) return false;
  const changes = lines
    .filter((l) => l.indent > 0)
    .map((l) => ({ from: l.from, to: l.from + Math.min(l.step, l.indent) }));
  if (changes.length > 0) view.dispatch({ changes, userEvent: "delete.dedent" });
  return true;
}

/**
 * Enter on an empty item that is nested goes out one level and keeps the item. At the left edge
 * the Markdown default applies (the empty item is removed and the list ends).
 */
export function outdentEmptyItem(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const [only] = listLines(view);
  if (only?.from !== line.from || !only.list || !only.empty || only.indent === 0) return false;
  return outdentList(view);
}

/** Tab and Shift+Tab move lines in and out; Enter on an empty nested list item goes out. */
export const listIndent = Prec.highest(
  keymap.of([
    { key: "Tab", run: indentList },
    { key: "Shift-Tab", run: outdentList },
    { key: "Enter", run: outdentEmptyItem },
  ]),
);
