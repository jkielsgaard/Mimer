import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { indentList, outdentEmptyItem, outdentList } from "./listIndent";

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

describe("indentList", () => {
  it("moves a bullet in by two spaces and keeps the cursor with it", () => {
    const v = view("- one\n- two", 9);
    expect(indentList(v)).toBe(true);
    expect(text(v)).toBe("- one\n  - two");
    expect(v.state.selection.main.head).toBe(11);
    v.destroy();
  });

  it("moves a numbered item by the width of its marker", () => {
    const v = view("1. one\n2. two", 10);
    indentList(v);
    expect(text(v)).toBe("1. one\n   2. two");
    v.destroy();
  });

  it("moves every line in a selection, list items by their marker and others by two spaces", () => {
    const v = view("- a\ntext\n- b", 0, 12);
    indentList(v);
    expect(text(v)).toBe("  - a\n  text\n  - b");
    v.destroy();
  });

  it("works on a task item", () => {
    const v = view("- [ ] step", 8);
    indentList(v);
    expect(text(v)).toBe("  - [ ] step");
    v.destroy();
  });

  it("moves a plain line in by two spaces when the caret is at its start", () => {
    const v = view("plain text", 0);
    expect(indentList(v)).toBe(true);
    expect(text(v)).toBe("  plain text");
    v.destroy();
  });

  it("puts a tab at the caret when it is after some text, not at the start of the line", () => {
    const v = view("text", 4);
    indentList(v);
    expect(text(v)).toBe("text\t");
    expect(v.state.selection.main.head).toBe(5);
    v.destroy();
  });

  it("still nests a list item when the caret is after its text", () => {
    const v = view("- text", 6);
    indentList(v);
    expect(text(v)).toBe("  - text");
    v.destroy();
  });

  it("moves an empty line, so the cursor can be put in before typing", () => {
    const v = view("one\n\ntwo", 4);
    indentList(v);
    expect(text(v)).toBe("one\n  \ntwo");
    v.destroy();
  });
});

describe("outdentList", () => {
  it("moves an indented bullet out", () => {
    const v = view("- one\n  - two", 11);
    expect(outdentList(v)).toBe(true);
    expect(text(v)).toBe("- one\n- two");
    v.destroy();
  });

  it("leaves a bullet at the left edge, but still takes the key", () => {
    const v = view("- one", 3);
    expect(outdentList(v)).toBe(true);
    expect(text(v)).toBe("- one");
    v.destroy();
  });

  it("takes back the tab before the caret", () => {
    const v = view("text\t", 5);
    outdentList(v);
    expect(text(v)).toBe("text");
    v.destroy();
  });

  it("moves a plain line out, and leaves one at the left edge", () => {
    const v = view("    plain", 4);
    outdentList(v);
    expect(text(v)).toBe("  plain");
    outdentList(v);
    outdentList(v);
    expect(text(v)).toBe("plain");
    v.destroy();
  });
});

describe("outdentEmptyItem", () => {
  it("takes an empty nested item out one level and keeps the marker", () => {
    const v = view("- one\n  - ", 10);
    expect(outdentEmptyItem(v)).toBe(true);
    expect(text(v)).toBe("- one\n- ");
    v.destroy();
  });

  it("leaves an empty item at the left edge to the Markdown default", () => {
    const v = view("- one\n- ", 8);
    expect(outdentEmptyItem(v)).toBe(false);
    v.destroy();
  });

  it("leaves an empty plain line alone", () => {
    const v = view("  ", 2);
    expect(outdentEmptyItem(v)).toBe(false);
    v.destroy();
  });

  it("leaves an item with text to the Markdown default", () => {
    const v = view("- one\n  - two", 13);
    expect(outdentEmptyItem(v)).toBe(false);
    v.destroy();
  });
});
