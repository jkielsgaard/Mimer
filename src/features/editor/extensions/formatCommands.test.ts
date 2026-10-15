import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { toggleWrap } from "./commands";
import {
  insertCodeBlock,
  insertLink,
  insertNoteLink,
  insertRule,
  insertWikiLink,
  setHeading,
  toggleBlock,
} from "./formatCommands";

/** A view on `doc` with the selection from `anchor` to `head` (default: a cursor at `anchor`). */
function view(doc: string, anchor: number, head = anchor): EditorView {
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [markdown({ base: markdownLanguage })],
    }),
  });
}

const text = (v: EditorView): string => v.state.doc.toString();

describe("setHeading", () => {
  it("adds, replaces and removes a heading marker", () => {
    const v = view("Title", 2);
    setHeading(v, 2);
    expect(text(v)).toBe("## Title");
    setHeading(v, 1);
    expect(text(v)).toBe("# Title");
    setHeading(v, 1); // same level again turns it back into a paragraph
    expect(text(v)).toBe("Title");
    v.destroy();
  });

  it("level 0 removes any heading and leaves plain text alone", () => {
    const v = view("### Deep", 0);
    setHeading(v, 0);
    expect(text(v)).toBe("Deep");
    setHeading(v, 0);
    expect(text(v)).toBe("Deep");
    v.destroy();
  });

  it("applies to every selected line and keeps the cursor on the same text", () => {
    const v = view("one\ntwo", 1, 6);
    setHeading(v, 3);
    expect(text(v)).toBe("### one\n### two");
    expect(v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)).toBe(
      "ne\n### tw",
    );
    v.destroy();
  });
});

describe("toggleBlock", () => {
  it("makes a bullet list from several lines and removes it again", () => {
    const v = view("a\nb\nc", 0, 5);
    toggleBlock(v, "bullet");
    expect(text(v)).toBe("- a\n- b\n- c");
    toggleBlock(v, "bullet");
    expect(text(v)).toBe("a\nb\nc");
    v.destroy();
  });

  it("numbers lines in order and skips blank lines", () => {
    const v = view("a\n\nb", 0, 4);
    toggleBlock(v, "number");
    expect(text(v)).toBe("1. a\n\n2. b");
    v.destroy();
  });

  it("switches between list types instead of stacking markers", () => {
    const v = view("- item", 3);
    toggleBlock(v, "number");
    expect(text(v)).toBe("1. item");
    toggleBlock(v, "task");
    expect(text(v)).toBe("- [ ] item");
    toggleBlock(v, "bullet");
    expect(text(v)).toBe("- item");
    v.destroy();
  });

  it("keeps indentation and works on quotes", () => {
    const v = view("  nested", 4);
    toggleBlock(v, "bullet");
    expect(text(v)).toBe("  - nested");
    toggleBlock(v, "quote");
    expect(text(v)).toBe("  > - nested");
    toggleBlock(v, "quote");
    expect(text(v)).toBe("  - nested");
    v.destroy();
  });

  it("starts a list on an empty line with the cursor after the marker", () => {
    const v = view("", 0);
    toggleBlock(v, "task");
    expect(text(v)).toBe("- [ ] ");
    expect(v.state.selection.main.head).toBe(6);
    v.destroy();
  });

  it("a selection that ends at the start of a line leaves that line alone", () => {
    const v = view("a\nb", 0, 2);
    toggleBlock(v, "bullet");
    expect(text(v)).toBe("- a\nb");
    v.destroy();
  });
});

describe("insertCodeBlock", () => {
  it("wraps the selection in a fence", () => {
    const v = view("x = 1", 0, 5);
    insertCodeBlock(v);
    expect(text(v)).toBe("```\nx = 1\n```\n");
    v.destroy();
  });

  it("inserts an empty block with the cursor inside, on its own line", () => {
    const v = view("intro", 5);
    insertCodeBlock(v);
    expect(text(v)).toBe("intro\n```\n\n```\n");
    expect(v.state.selection.main.head).toBe(10);
    v.destroy();
  });
});

describe("insertLink and insertWikiLink", () => {
  it("uses the selection as link text and selects the url", () => {
    const v = view("see docs", 4, 8);
    insertLink(v);
    expect(text(v)).toBe("see [docs](url)");
    const sel = v.state.selection.main;
    expect(v.state.sliceDoc(sel.from, sel.to)).toBe("url");
    v.destroy();
  });

  it("without a selection offers a placeholder text to replace", () => {
    const v = view("", 0);
    insertLink(v);
    expect(text(v)).toBe("[text](url)");
    const sel = v.state.selection.main;
    expect(v.state.sliceDoc(sel.from, sel.to)).toBe("text");
    v.destroy();
  });

  it("wraps text in a wiki-link, or puts the cursor inside empty brackets", () => {
    const a = view("Plan", 0, 4);
    insertWikiLink(a);
    expect(text(a)).toBe("[[Plan]]");
    expect(a.state.selection.main.head).toBe(8);
    a.destroy();
    const b = view("", 0);
    insertWikiLink(b);
    expect(text(b)).toBe("[[]]");
    expect(b.state.selection.main.head).toBe(2);
    b.destroy();
  });
});

describe("insertRule", () => {
  it("puts a blank line above text so it is not a heading underline", () => {
    const v = view("Title", 5);
    insertRule(v);
    expect(text(v)).toBe("Title\n\n---\n");
    v.destroy();
  });

  it("adds no extra blank line after an empty line or at the top", () => {
    const a = view("Title\n\n", 7);
    insertRule(a);
    expect(text(a)).toBe("Title\n\n---\n");
    a.destroy();
    const b = view("", 0);
    insertRule(b);
    expect(text(b)).toBe("---\n");
    b.destroy();
  });
});

describe("toggleWrap with line breaks and spaces in the selection", () => {
  it("keeps a trailing line break outside the marker (triple-click selects it)", () => {
    const v = view("Hello line.\nNext", 0, 12);
    toggleWrap(v, "**");
    expect(text(v)).toBe("**Hello line.**\nNext");
    toggleWrap(v, "**");
    expect(text(v)).toBe("Hello line.\nNext");
    v.destroy();
  });

  it("keeps leading and trailing spaces outside the marker", () => {
    const v = view("a  word  b", 1, 9);
    toggleWrap(v, "_");
    expect(text(v)).toBe("a  _word_  b");
    v.destroy();
  });

  it("a selection of only spaces behaves like a cursor", () => {
    const v = view("a   b", 1, 4);
    toggleWrap(v, "**");
    expect(text(v)).toBe("a   ****b");
    v.destroy();
  });
});

describe("strikethrough and inline code via toggleWrap", () => {
  it("wraps with ~~ and ` and unwraps again", () => {
    const v = view("word", 0, 4);
    toggleWrap(v, "~~");
    expect(text(v)).toBe("~~word~~");
    toggleWrap(v, "~~");
    expect(text(v)).toBe("word");
    toggleWrap(v, "`");
    expect(text(v)).toBe("`word`");
    v.destroy();
  });
});

describe("insertNoteLink", () => {
  it("inserts a wiki-link at the cursor", () => {
    const v = view("See ", 4);
    insertNoteLink(v, "Plan");
    expect(text(v)).toBe("See [[Plan]]");
    expect(v.state.selection.main.head).toBe(12);
    v.destroy();
  });

  it("keeps selected text as the visible link text when it differs from the name", () => {
    const v = view("read the budget now", 9, 15);
    insertNoteLink(v, "Finance/Q1 plan");
    expect(text(v)).toBe("read the [[Finance/Q1 plan|budget]] now");
    v.destroy();
  });

  it("does not repeat the name as an alias, and ignores multi-line selections for aliases", () => {
    const a = view("Plan", 0, 4);
    insertNoteLink(a, "Work/Plan");
    expect(text(a)).toBe("[[Work/Plan]]");
    a.destroy();
    const b = view("one\ntwo", 0, 7);
    insertNoteLink(b, "Target");
    expect(text(b)).toBe("[[Target]]");
    b.destroy();
  });
});
