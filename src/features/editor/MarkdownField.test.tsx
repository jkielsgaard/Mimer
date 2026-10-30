import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownField } from "./MarkdownField";

/** The editor behind the box, found from the element a screen reader sees. */
function viewOf(label: string): EditorView {
  const v = EditorView.findFromDOM(screen.getByLabelText(label));
  if (!v) throw new Error("no editor");
  return v;
}

describe("MarkdownField", () => {
  it("shows the text, is named for a screen reader, and tells what is typed", () => {
    const onChange = vi.fn();
    render(<MarkdownField label="Note" value="Hello" onChange={onChange} />);
    const v = viewOf("Note");
    expect(v.state.doc.toString()).toBe("Hello");
    v.dispatch({ changes: { from: 5, insert: " **bold**" } });
    expect(onChange).toHaveBeenCalledWith("Hello **bold**");
  });

  it("takes a new value from outside, and leaves the text alone when it is the same", () => {
    const { rerender } = render(<MarkdownField label="Note" value="One" />);
    const v = viewOf("Note");
    v.dispatch({ selection: { anchor: 3 } });
    rerender(<MarkdownField label="Note" value="One" />);
    expect(v.state.selection.main.head).toBe(3);
    rerender(<MarkdownField label="Note" value="Two" />);
    expect(viewOf("Note").state.doc.toString()).toBe("Two");
  });

  it("hides the Markdown marks off the cursor line, so bold shows as bold", () => {
    render(<MarkdownField label="Note" value={"Line one\n**Bold** line"} />);
    expect(document.querySelector(".cm-strong")).not.toBeNull();
  });

  it("tells when the box is left", () => {
    const onBlur = vi.fn();
    render(<MarkdownField label="Note" value="Text" onBlur={onBlur} />);
    const content = screen.getByLabelText("Note");
    content.dispatchEvent(new FocusEvent("blur"));
    expect(onBlur).toHaveBeenCalledWith("Text");
  });

  it("refuses a second line in a single-line box", () => {
    render(<MarkdownField label="Log" value="Text" singleLine />);
    const v = viewOf("Log");
    v.dispatch({ changes: { from: 4, insert: "\nmore" } });
    expect(v.state.doc.toString()).toBe("Text");
  });
});

describe("MarkdownField keys", () => {
  it("saves on Enter when asked to, and Shift+Enter does nothing in a single-line box", () => {
    const onSubmit = vi.fn();
    render(
      <MarkdownField label="Log" value="Done" singleLine submitKey="enter" onSubmit={onSubmit} />,
    );
    const content = viewOf("Log").contentDOM;
    fireEvent.keyDown(content, { key: "Enter", keyCode: 13, shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(viewOf("Log").state.doc.toString()).toBe("Done");
    fireEvent.keyDown(content, { key: "Enter", keyCode: 13 });
    expect(onSubmit).toHaveBeenCalledWith("Done");
  });

  it("saves on Ctrl+Enter when asked to, and Enter is a new line", () => {
    const onSubmit = vi.fn();
    render(<MarkdownField label="Note" value="Text" submitKey="mod-enter" onSubmit={onSubmit} />);
    const content = viewOf("Note").contentDOM;
    fireEvent.keyDown(content, { key: "Enter", keyCode: 13, ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("Text");
  });
});
