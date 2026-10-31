import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

describe("DialogContent", () => {
  it("keeps its mouse presses from a parent that holds on to the editor's focus", () => {
    const parent = vi.fn((e: React.SyntheticEvent) => {
      e.preventDefault();
    });
    render(
      <div onMouseDown={parent}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Tags</DialogTitle>
            <input aria-label="Add a tag" />
          </DialogContent>
        </Dialog>
      </div>,
    );
    // fireEvent returns false when the press was cancelled, which would keep the box unfocused.
    expect(fireEvent.mouseDown(screen.getByLabelText("Add a tag"))).toBe(true);
    expect(parent).not.toHaveBeenCalled();
  });
});
