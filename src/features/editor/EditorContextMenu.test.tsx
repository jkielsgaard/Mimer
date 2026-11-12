import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorContextMenu } from "./EditorContextMenu";

function view(): EditorView {
  const parent = document.createElement("div");
  document.body.append(parent);
  return new EditorView({
    parent,
    state: EditorState.create({ doc: "hello world", selection: { anchor: 0, head: 5 } }),
  });
}

describe("EditorContextMenu", () => {
  const clip = { writeText: vi.fn(), readText: vi.fn() };
  beforeEach(() => {
    clip.writeText.mockReset().mockResolvedValue(undefined);
    clip.readText.mockReset().mockResolvedValue("there");
    Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
  });

  function show(v: EditorView, extra: { aiOff?: string | null } = {}) {
    const props = { onAi: vi.fn(), onCapture: vi.fn(), onClose: vi.fn() };
    render(
      <EditorContextMenu at={{ x: 10, y: 10 }} view={v} aiOff={extra.aiOff ?? null} {...props} />,
    );
    return props;
  }

  it("is moved up and left when it would run off the screen", () => {
    const high = window.innerHeight;
    const wide = window.innerWidth;
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 224,
      height: 320,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 224,
      bottom: 320,
      toJSON: () => ({}),
    });
    try {
      render(
        <EditorContextMenu
          at={{ x: 780, y: 580 }}
          view={view()}
          aiOff={null}
          onAi={vi.fn()}
          onCapture={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const menu = screen.getByRole("menu", { name: "Text" });
      expect(menu.style.left).toBe("568px");
      expect(menu.style.top).toBe("272px");
      expect(menu.style.maxHeight).toBe("584px");
    } finally {
      rect.mockRestore();
      Object.defineProperty(window, "innerHeight", { value: high, configurable: true });
      Object.defineProperty(window, "innerWidth", { value: wide, configurable: true });
    }
  });

  it("starts with the usual text commands and has the AI as one line", () => {
    show(view());
    const names = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(names.slice(0, 4).map((n) => n.replace(/Ctrl\+.$/, ""))).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select all",
    ]);
    expect(screen.getByRole("menuitem", { name: /^AI/ })).toBeEnabled();
  });

  it("copies, cuts, pastes and selects all", async () => {
    const v = view();
    const props = show(v);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Copy/ }));
    expect(clip.writeText).toHaveBeenCalledWith("hello");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Cut/ }));
    await waitFor(() => {
      expect(v.state.doc.toString()).toBe(" world");
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Paste/ }));
    await waitFor(() => {
      expect(v.state.doc.toString()).toContain("there");
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Select all/ }));
    expect(v.state.selection.main.to).toBe(v.state.doc.length);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("opens the AI, and has it off with the reason when there is no AI", async () => {
    const props = show(view());
    await userEvent.setup().click(screen.getByRole("menuitem", { name: /^AI/ }));
    expect(props.onAi).toHaveBeenCalled();
  });

  it("turns the AI line off when the AI cannot be used", () => {
    show(view(), { aiOff: "No AI is set up." });
    expect(screen.getByRole("menuitem", { name: /^AI/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /^Copy/ })).toBeEnabled();
  });
});
