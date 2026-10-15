import { startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, type ChangeSpec, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// Markdown formatting commands used by the editor toolbar. Each takes the view, edits the
// document in one transaction and returns true. They only change text; the live preview decides
// how it looks.

/** A line touched by the selection. */
interface LineInfo {
  from: number;
  text: string;
}

/** Lines covered by the main selection. A selection that ends at the start of a line leaves that line out. */
function targetLines(state: EditorState): LineInfo[] {
  const sel = state.selection.main;
  const first = state.doc.lineAt(sel.from);
  let lastPos = sel.to;
  if (!sel.empty && sel.to > first.to && state.doc.lineAt(sel.to).from === sel.to) {
    lastPos = sel.to - 1;
  }
  const last = state.doc.lineAt(Math.max(lastPos, sel.from));
  const out: LineInfo[] = [];
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n);
    out.push({ from: line.from, text: line.text });
  }
  return out;
}

/** Applies changes and keeps the selection on the same text (insertions at its start land before it). */
function applyKeepingSelection(view: EditorView, changes: ChangeSpec[]): void {
  const cs = view.state.changes(changes);
  const sel = view.state.selection.main;
  view.dispatch({
    changes: cs,
    selection: EditorSelection.range(cs.mapPos(sel.anchor, 1), cs.mapPos(sel.head, 1)),
  });
}

const HEADING = /^#{1,6}\s+/;

/**
 * Sets the heading level of the selected lines (1–6). Choosing the level the lines already have
 * turns them back into normal paragraphs; `0` always removes the heading marker.
 */
export function setHeading(view: EditorView, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
  const lines = targetLines(view.state);
  const levelOf = (text: string): number => HEADING.exec(text)?.[0].trim().length ?? 0;
  const target = lines.every((l) => levelOf(l.text) === level) ? 0 : level;
  const changes: ChangeSpec[] = [];
  for (const l of lines) {
    const existing = HEADING.exec(l.text)?.[0].length ?? 0;
    const insert = target === 0 ? "" : `${"#".repeat(target)} `;
    if (existing === 0 && insert === "") continue;
    changes.push({ from: l.from, to: l.from + existing, insert });
  }
  applyKeepingSelection(view, changes);
  return true;
}

export type BlockKind = "bullet" | "number" | "task" | "quote";

const TASK = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;
const BULLET = /^(\s*)[-*+]\s+/;
const NUMBER = /^(\s*)\d+[.)]\s+/;
const QUOTE = /^(\s*)>\s?/;

/** The marker of `kind` at the start of a line, if it has one. */
function markerOf(text: string, kind: BlockKind): RegExpExecArray | null {
  switch (kind) {
    case "task":
      return TASK.exec(text);
    case "bullet":
      return TASK.test(text) ? null : BULLET.exec(text);
    case "number":
      return NUMBER.exec(text);
    case "quote":
      return QUOTE.exec(text);
  }
}

/** Any list marker (bullet, number or task) at the start of a line. */
function listMarkerOf(text: string): RegExpExecArray | null {
  return TASK.exec(text) ?? BULLET.exec(text) ?? NUMBER.exec(text);
}

/**
 * Toggles a list or quote on the selected lines. If every line already has it, it is removed;
 * otherwise it is added, replacing any other list marker. Blank lines are skipped unless the
 * selection is only blank lines.
 */
export function toggleBlock(view: EditorView, kind: BlockKind): boolean {
  const lines = targetLines(view.state);
  const filled = lines.filter((l) => l.text.trim() !== "");
  const targets = filled.length > 0 ? filled : lines;
  const allHave = targets.every((l) => markerOf(l.text, kind) !== null);
  const changes: ChangeSpec[] = [];
  targets.forEach((l, i) => {
    if (allHave) {
      const m = markerOf(l.text, kind);
      if (m) changes.push({ from: l.from + (m[1] ?? "").length, to: l.from + m[0].length });
      return;
    }
    const indent = (/^\s*/.exec(l.text)?.[0] ?? "").length;
    const other = kind === "quote" ? null : listMarkerOf(l.text);
    const prefix =
      kind === "bullet"
        ? "- "
        : kind === "task"
          ? "- [ ] "
          : kind === "number"
            ? `${String(i + 1)}. `
            : "> ";
    changes.push({
      from: l.from + indent,
      to: l.from + (other ? other[0].length : indent),
      insert: prefix,
    });
  });
  applyKeepingSelection(view, changes);
  return true;
}

/** Wraps the selection in a fenced code block, or inserts an empty one on its own lines. */
export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const text = state.sliceDoc(sel.from, sel.to);
  const lead = sel.from === state.doc.lineAt(sel.from).from ? "" : "\n";
  const insert = `${lead}\`\`\`\n${text}\n\`\`\`\n`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: text === "" ? sel.from + lead.length + 4 : sel.from + insert.length },
  });
  return true;
}

/**
 * Inserts `[text](url)`. With a selection it becomes the link text and `url` is selected for
 * typing; without one the placeholder `text` is selected.
 */
export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const selected = state.sliceDoc(sel.from, sel.to);
  const label = selected === "" ? "text" : selected;
  const insert = `[${label}](url)`;
  const labelFrom = sel.from + 1;
  const urlFrom = labelFrom + label.length + 2;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection:
      selected === ""
        ? { anchor: labelFrom, head: labelFrom + label.length }
        : { anchor: urlFrom, head: urlFrom + 3 },
  });
  return true;
}

/** Inserts `[[…]]` around the selection; with no selection the cursor goes inside and the note list opens. */
export function insertWikiLink(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const selected = state.sliceDoc(sel.from, sel.to);
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `[[${selected}]]` },
    selection: { anchor: selected === "" ? sel.from + 2 : sel.from + selected.length + 4 },
  });
  if (selected === "") startCompletion(view);
  return true;
}

/** Inserts a horizontal rule on its own line, with a blank line above so it is not read as a heading underline. */
export function insertRule(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.from);
  const atLineStart = sel.from === line.from;
  const before = atLineStart
    ? line.number > 1
      ? state.doc.line(line.number - 1).text
      : ""
    : line.text.slice(0, sel.from - line.from);
  const insert = `${atLineStart ? "" : "\n"}${before.trim() === "" ? "" : "\n"}---\n`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  return true;
}

/**
 * Replaces the selection with a wiki-link to `target`. A one-line selection that differs from
 * the note's name stays visible as the link text: `[[Target|selected text]]`.
 */
export function insertNoteLink(view: EditorView, target: string): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const selected = state.sliceDoc(sel.from, sel.to).trim();
  const name = (target.split("/").pop() ?? target).toLowerCase();
  const useAlias = selected !== "" && !selected.includes("\n") && selected.toLowerCase() !== name;
  const insert = useAlias ? `[[${target}|${selected}]]` : `[[${target}]]`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  return true;
}
