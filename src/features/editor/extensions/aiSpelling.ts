import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/** A misspelt word the AI found, and what it should be. */
export interface SpellFix {
  wrong: string;
  right: string;
}

/** A marked word in the note. */
export interface SpellMark extends SpellFix {
  from: number;
  to: number;
}

export interface SpellingConfig {
  enabled: boolean;
  /** Asks the AI for the misspelt words of a paragraph. */
  check: (text: string) => Promise<SpellFix[]>;
  /** Words that are never marked. */
  ownWords: readonly string[];
  /** A marked word was clicked; `x`/`y` are screen coordinates under it. */
  onPick: (mark: SpellMark, x: number, y: number) => void;
}

/** How long to wait after the last key press before a paragraph is checked (milliseconds). */
export const SPELL_DELAY_MS = 1500;

/** Replaces the marks of one paragraph (exported for tests). */
export const setMarks = StateEffect.define<{ from: number; to: number; marks: SpellMark[] }>();
const removeMarks = StateEffect.define<(m: SpellMark) => boolean>();

const markDeco = (m: SpellMark): Decoration =>
  Decoration.mark({
    class: "cm-ai-spell",
    attributes: { title: `Did you mean “${m.right}”? Click the word.` },
  });

function build(marks: readonly SpellMark[]): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const m of [...marks].sort((a, c) => a.from - c.from)) b.add(m.from, m.to, markDeco(m));
  return b.finish();
}

/** The marked words, kept in step with edits. A word that is edited loses its mark. */
export const spellField = StateField.define<SpellMark[]>({
  create: () => [],
  update(marks, tr) {
    let out = marks;
    if (tr.docChanged) {
      out = [];
      for (const m of marks) {
        if (!tr.changes.touchesRange(m.from, m.to)) {
          out.push({ ...m, from: tr.changes.mapPos(m.from, 1), to: tr.changes.mapPos(m.to, -1) });
        }
      }
    }
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        out = [...out.filter((m) => m.to < e.value.from || m.from > e.value.to), ...e.value.marks];
      } else if (e.is(removeMarks)) {
        out = out.filter((m) => !e.value(m));
      }
    }
    return out;
  },
  provide: (f) => EditorView.decorations.from(f, build),
});

/** Removes marks: all of them, or the ones `which` picks. */
export function clearSpelling(
  view: EditorView,
  which: (m: SpellMark) => boolean = () => true,
): void {
  view.dispatch({ effects: removeMarks.of(which) });
}

/** The paragraph around a position: the lines next to it up to a blank line (at most 40). */
export function paragraphAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; text: string } {
  const doc = state.doc;
  let first = doc.lineAt(pos).number;
  let last = first;
  const blank = (n: number): boolean => doc.line(n).text.trim() === "";
  if (blank(first)) return { from: pos, to: pos, text: "" };
  while (first > 1 && !blank(first - 1) && last - first < 40) first--;
  while (last < doc.lines && !blank(last + 1) && last - first < 40) last++;
  const from = doc.line(first).from;
  const to = doc.line(last).to;
  return { from, to, text: state.sliceDoc(from, to) };
}

const WORD = /[\p{L}\p{N}'’-]/u;

/** Where the words the AI named are in a paragraph that starts at `offset`. Whole words only. */
export function locate(
  text: string,
  offset: number,
  fixes: readonly SpellFix[],
  ownWords: readonly string[],
): SpellMark[] {
  const own = new Set(ownWords.map((w) => w.trim().toLowerCase()).filter((w) => w !== ""));
  const out: SpellMark[] = [];
  for (const f of fixes) {
    const wrong = f.wrong.trim();
    const right = f.right.trim();
    if (wrong === "" || right === "" || wrong === right || own.has(wrong.toLowerCase())) continue;
    let at = text.indexOf(wrong);
    while (at !== -1) {
      const before = at === 0 ? "" : (text[at - 1] ?? "");
      const after = text[at + wrong.length] ?? "";
      if (!WORD.test(before) && !WORD.test(after)) {
        out.push({ from: offset + at, to: offset + at + wrong.length, wrong, right });
      }
      at = text.indexOf(wrong, at + wrong.length);
    }
  }
  return out;
}

/** Reads the AI's answer: one `wrong => right` per line, or NONE. */
export function parseFixes(answer: string): SpellFix[] {
  if (/^\s*NONE\b/i.test(answer)) return [];
  const out: SpellFix[] = [];
  for (const line of answer.split("\n")) {
    const m = /^\s*(?:[-*]\s+|\d+[.)]\s+)?["“]?(.+?)["”]?\s*(?:=>|->|→)\s*["“]?(.+?)["”]?\s*$/.exec(
      line,
    );
    if (m?.[1] && m[2] && m[1].length <= 40 && m[2].length <= 40) {
      out.push({ wrong: m[1], right: m[2] });
    }
  }
  return out;
}

/**
 * Spelling help: a moment after you stop typing, the paragraph you wrote in is checked by the
 * local AI, and misspelt words get a wavy line. Nothing is changed: you click a word and choose.
 * The marks are only shown, never written into the note.
 */
export function aiSpelling(config: () => SpellingConfig): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null;
      pending = -1;
      cache = new Map<string, SpellFix[]>();
      busy = false;
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate): void {
        const cfg = config();
        if (!cfg.enabled) {
          if (u.state.field(spellField).length > 0) {
            queueMicrotask(() => {
              clearSpelling(this.view);
            });
          }
          return;
        }
        if (
          !u.docChanged ||
          !u.transactions.some((t) => t.isUserEvent("input") || t.isUserEvent("delete"))
        ) {
          return;
        }
        this.pending = u.state.selection.main.head;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.run(), SPELL_DELAY_MS);
      }
      async run(): Promise<void> {
        const cfg = config();
        if (!cfg.enabled || this.busy || this.pending < 0) return;
        const pos = Math.min(this.pending, this.view.state.doc.length);
        this.pending = -1;
        const para = paragraphAt(this.view.state, pos);
        if (para.text.trim().split(/\s+/).length < 3 || /^\s*(```|~~~)/m.test(para.text)) return;
        this.busy = true;
        try {
          const fixes = this.cache.get(para.text) ?? (await cfg.check(para.text));
          this.cache.set(para.text, fixes);
          if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value ?? "");
          // Only mark the paragraph if it is still the same text.
          if (this.view.state.sliceDoc(para.from, para.to) !== para.text) return;
          this.view.dispatch({
            effects: setMarks.of({
              from: para.from,
              to: para.to,
              marks: locate(para.text, para.from, fixes, config().ownWords),
            }),
          });
        } catch {
          // No AI right now: nothing is marked, and writing goes on as usual.
        } finally {
          this.busy = false;
        }
      }
      destroy(): void {
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
  return [
    spellField,
    plugin,
    EditorView.domEventHandlers({
      click: (e, view) => {
        const target = e.target instanceof Element ? e.target.closest(".cm-ai-spell") : null;
        if (!target) return false;
        const pos = view.posAtDOM(target);
        const mark = view.state.field(spellField).find((m) => pos >= m.from && pos <= m.to);
        if (!mark) return false;
        const r = target.getBoundingClientRect();
        config().onPick(mark, r.left, r.bottom);
        return false;
      },
    }),
    EditorView.baseTheme({
      ".cm-ai-spell": {
        textDecoration: "underline wavy #c2410c",
        textUnderlineOffset: "3px",
        cursor: "pointer",
      },
    }),
  ];
}
