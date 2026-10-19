import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectionBubble } from "./SelectionBubble";

function setup(selection: { anchor: number; head: number }, hidden = false) {
  const hostEl = document.createElement("div");
  document.body.appendChild(hostEl);
  const view = new EditorView({
    state: EditorState.create({ doc: "hello big world", selection }),
    parent: hostEl,
  });
  vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 100, right: 110, top: 200, bottom: 216 });
  const host = createRef<HTMLDivElement>();
  (host as { current: HTMLDivElement }).current = hostEl;
  const viewRef = createRef<EditorView>();
  (viewRef as { current: EditorView }).current = view;
  const onChoose = vi.fn();
  render(<SelectionBubble host={host} viewRef={viewRef} hidden={hidden} onChoose={onChoose} />);
  return { hostEl, onChoose };
}

describe("SelectionBubble", () => {
  it("appears over a selection of some length and starts the chosen command", () => {
    const { hostEl, onChoose } = setup({ anchor: 0, head: 9 });
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.mouseUp(hostEl);
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shorten" }));
    expect(onChoose).toHaveBeenCalledWith({ id: "shorten" });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("offers to write the selection down as a task or an idea", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello big world", selection: { anchor: 0, head: 9 } }),
      parent: hostEl,
    });
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 100, right: 110, top: 200, bottom: 216 });
    const host = createRef<HTMLDivElement>();
    (host as { current: HTMLDivElement }).current = hostEl;
    const viewRef = createRef<EditorView>();
    (viewRef as { current: EditorView }).current = view;
    const onCapture = vi.fn();
    render(
      <SelectionBubble
        host={host}
        viewRef={viewRef}
        hidden={false}
        onChoose={vi.fn()}
        onCapture={onCapture}
      />,
    );
    fireEvent.mouseUp(hostEl);
    fireEvent.click(screen.getByRole("button", { name: "As an idea" }));
    expect(onCapture).toHaveBeenCalledWith("idea");
    fireEvent.mouseUp(hostEl);
    fireEvent.click(screen.getByRole("button", { name: "As a task" }));
    expect(onCapture).toHaveBeenCalledWith("task");
  });

  it("opens the menu of all AI commands, and turns the AI off with the reason", () => {
    const { hostEl, onChoose } = setup({ anchor: 0, head: 9 });
    fireEvent.mouseUp(hostEl);
    fireEvent.click(screen.getByRole("button", { name: "More AI commands" }));
    expect(onChoose).toHaveBeenCalledWith(undefined);
  });

  it("stays away for a tiny or empty selection", () => {
    const { hostEl } = setup({ anchor: 2, head: 3 });
    fireEvent.mouseUp(hostEl);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("stays hidden while the popup is open", () => {
    const { hostEl } = setup({ anchor: 0, head: 9 }, true);
    fireEvent.mouseUp(hostEl);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("SelectionBubble without an AI", () => {
  it("keeps As a task and As an idea, and turns the AI buttons off", () => {
    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello big world", selection: { anchor: 0, head: 9 } }),
      parent: hostEl,
    });
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 100, right: 110, top: 200, bottom: 216 });
    const host = createRef<HTMLDivElement>();
    (host as { current: HTMLDivElement }).current = hostEl;
    const viewRef = createRef<EditorView>();
    (viewRef as { current: EditorView }).current = view;
    render(
      <SelectionBubble
        host={host}
        viewRef={viewRef}
        hidden={false}
        aiOff="No AI is set up."
        onChoose={vi.fn()}
        onCapture={vi.fn()}
      />,
    );
    fireEvent.mouseUp(hostEl);
    expect(screen.getByRole("button", { name: "Fix" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fix" })).toHaveAttribute(
      "title",
      "No AI is set up.",
    );
    expect(screen.getByRole("button", { name: "As a task" })).toBeEnabled();
  });
});
