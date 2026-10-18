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
