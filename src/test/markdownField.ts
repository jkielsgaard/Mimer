import { EditorView } from "@codemirror/view";
import { act, fireEvent, screen } from "@testing-library/react";

/** The editor behind a `MarkdownField`, found by the name it has for a screen reader. */
export function fieldView(label: string): EditorView {
  const v = EditorView.findFromDOM(screen.getByLabelText(label));
  if (!v) throw new Error(`No Markdown field called "${label}"`);
  return v;
}

/** Writes `text` in a `MarkdownField` as if it was typed (after what is already there). */
export function typeInField(label: string, text: string): void {
  const v = fieldView(label);
  const at = v.state.doc.length;
  act(() => {
    v.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
  });
}

/** Replaces everything in a `MarkdownField` with `text`. */
export function setField(label: string, text: string): void {
  const v = fieldView(label);
  act(() => {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  });
}

/** Presses Enter in a `MarkdownField` (with `mod`, Ctrl+Enter). */
export function pressEnter(label: string, opts: { mod?: boolean; shift?: boolean } = {}): void {
  fireEvent.keyDown(fieldView(label).contentDOM, {
    key: "Enter",
    keyCode: 13,
    ctrlKey: opts.mod === true,
    shiftKey: opts.shift === true,
  });
}
