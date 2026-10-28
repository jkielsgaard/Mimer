import type { KeyboardEvent } from "react";

/** How far a line that is not a list item moves: two spaces, so it does not become a code block. */
export const PLAIN_STEP = 2;

/** A list line: the indent, the marker (`-`, `*`, `+`, `1.`), the space after it and a checkbox. */
export const LIST_LINE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?/;

/** How far one line moves in or out: a list item by its marker, any other line by two spaces. */
export function lineStep(text: string): number {
  const m = LIST_LINE.exec(text);
  return m ? Math.max(2, (m[2] ?? "").length + 1) : PLAIN_STEP;
}

/**
 * A caret after some text on a line that is not a list item. There Tab puts a tab at the caret
 * ("text⇥"), and Shift+Tab takes one back; at the start of a line, or in a list, the line moves.
 */
export function isInlineTab(line: string, col: number): boolean {
  return !LIST_LINE.test(line) && line.slice(0, col).trim() !== "";
}

export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

/**
 * Tab (`out` false) or Shift+Tab (`out` true) on the lines a selection touches in plain text, the
 * way the note editor does it. The selection keeps pointing at the same text.
 */
export function indentLines(value: string, start: number, end: number, out: boolean): TextEdit {
  const first = value.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends at the start of a line does not include that line.
  const last = Math.max(first, end > start && value[end - 1] === "\n" ? end - 1 : end);
  // Each line from `first` to the end of the line `last` is in: where it was, how it changed.
  const lineEnd = value.indexOf("\n", last);
  const stop = lineEnd === -1 ? value.length : lineEnd;
  const rows: { from: number; length: number; change: number }[] = [];
  let at = first;
  for (const line of value.slice(first, stop).split("\n")) {
    const lead = (/^[ \t]*/.exec(line)?.[0] ?? "").length;
    const step = lineStep(line);
    rows.push({ from: at, length: line.length, change: out ? -Math.min(step, lead) : step });
    at += line.length + 1;
  }
  const text = value
    .slice(first, stop)
    .split("\n")
    .map((line, i) => {
      const change = rows[i]?.change ?? 0;
      return change >= 0 ? " ".repeat(change) + line : line.slice(-change);
    })
    .join("\n");
  const total = rows.reduce((n, r) => n + r.change, 0);
  /** Where a position in the old text is in the new. */
  const map = (p: number): number => {
    let shift = 0;
    for (const r of rows) {
      if (p <= r.from + r.length) {
        const rel = p - r.from;
        return r.from + shift + (r.change >= 0 ? rel + r.change : Math.max(0, rel + r.change));
      }
      shift += r.change;
    }
    return p + total;
  };
  return {
    value: value.slice(0, first) + text + value.slice(stop),
    start: map(start),
    end: map(end),
  };
}

/**
 * Enter on an empty list item that is nested takes it out one level and keeps the item. Returns
 * null for any other line, which then gets the normal Enter.
 */
export function outdentEmptyItem(value: string, caret: number): TextEdit | null {
  const first = value.lastIndexOf("\n", caret - 1) + 1;
  const nl = value.indexOf("\n", caret);
  const line = value.slice(first, nl === -1 ? value.length : nl);
  const m = LIST_LINE.exec(line);
  if (!m || (m[1] ?? "").length === 0 || line.slice(m[0].length).trim() !== "") return null;
  return indentLines(value, caret, caret, true);
}

/**
 * Tab and Shift+Tab move the lines of a text box in and out, and Enter on an empty nested list item
 * goes out one level, as in the note editor. Give it to `onKeyDown` of every box where notes are
 * written.
 */
export function indentKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
  const el = e.currentTarget;
  let edit: TextEdit | null = null;
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const at = el.selectionStart;
    const first = el.value.lastIndexOf("\n", at - 1) + 1;
    const nl = el.value.indexOf("\n", at);
    const line = el.value.slice(first, nl === -1 ? el.value.length : nl);
    if (at === el.selectionEnd && isInlineTab(line, at - first) && !e.shiftKey) {
      edit = {
        value: `${el.value.slice(0, at)}\t${el.value.slice(at)}`,
        start: at + 1,
        end: at + 1,
      };
    } else if (
      at === el.selectionEnd &&
      isInlineTab(line, at - first) &&
      el.value[at - 1] === "\t"
    ) {
      edit = { value: el.value.slice(0, at - 1) + el.value.slice(at), start: at - 1, end: at - 1 };
    } else {
      edit = indentLines(el.value, el.selectionStart, el.selectionEnd, e.shiftKey);
    }
  } else if (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    el.selectionStart === el.selectionEnd
  ) {
    edit = outdentEmptyItem(el.value, el.selectionStart);
  }
  if (edit === null) return;
  e.preventDefault();
  if (edit.value === el.value) return;
  // React watches `value` through its own setter on the element, so a plain `el.value = …` is not
  // seen as a change. The prototype's setter is: the input event then reaches onChange.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
    el,
    edit.value,
  );
  el.setSelectionRange(edit.start, edit.end);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
