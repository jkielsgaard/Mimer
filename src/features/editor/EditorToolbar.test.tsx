import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "./EditorToolbar";

let view: EditorView | null = null;

/** A real editor on `doc` with the selection from `anchor` to `head`. */
function setup(doc: string, anchor: number, head = anchor, disabled = false) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [markdown({ base: markdownLanguage })],
    }),
  });
  const viewRef = { current: view };
  render(<EditorToolbar viewRef={viewRef} disabled={disabled} />);
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("EditorToolbar", () => {
  it("offers the common Markdown tools, including the table", () => {
    setup("", 0);
    for (const name of [
      "Bold",
      "Italic",
      "Strikethrough",
      "Inline code",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Quote",
      "Link",
      "Link to a note",
      "Insert table",
      "Code block",
      "Horizontal line",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("applies a tool to the selection in the editor", () => {
    const v = setup("hello world", 0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(v.state.doc.toString()).toBe("**hello** world");
    fireEvent.click(screen.getByRole("button", { name: "Heading 2" }));
    expect(v.state.doc.toString()).toBe("## **hello** world");
  });

  it("inserts a table that can be parsed back", () => {
    const v = setup("", 0);
    fireEvent.click(screen.getByRole("button", { name: "Insert table" }));
    const lines = v.state.doc.toString().trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^\|( -+ \|)+$/);
  });

  it("does not take focus from the editor when a tool is pressed", () => {
    setup("x", 0);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "Italic" }).dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("is disabled while no note is open and then changes nothing", () => {
    const v = setup("keep", 0, 4, true);
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold).toBeDisabled();
    fireEvent.click(bold);
    expect(v.state.doc.toString()).toBe("keep");
  });

  it("opens the note picker for Link to a note when one is provided", () => {
    const onPickLink = vi.fn();
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "x", extensions: [markdown({ base: markdownLanguage })] }),
    });
    render(<EditorToolbar viewRef={{ current: view }} disabled={false} onPickLink={onPickLink} />);
    fireEvent.click(screen.getByRole("button", { name: "Link to a note" }));
    expect(onPickLink).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("x");
  });

  it("has an Insert image button that asks the editor to add pictures", () => {
    const onInsertImage = vi.fn();
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "x", extensions: [markdown({ base: markdownLanguage })] }),
    });
    render(
      <EditorToolbar viewRef={{ current: view }} disabled={false} onInsertImage={onInsertImage} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(onInsertImage).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("x");
  });
});
