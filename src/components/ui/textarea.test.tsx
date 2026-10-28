import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

function Box({ indent }: { indent?: boolean }) {
  const [v, setV] = useState("- one\n- two");
  return (
    <>
      <output data-testid="state">{v}</output>
      <Textarea
        aria-label="box"
        indent={indent}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
        }}
      />
    </>
  );
}

describe("Textarea indent", () => {
  it("moves the line with the caret in with Tab and out with Shift+Tab", async () => {
    render(<Box indent />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("box");
    box.focus();
    box.setSelectionRange(9, 9);
    await userEvent.setup().keyboard("{Tab}");
    expect(box.value).toBe("- one\n  - two");
    // The change reaches the component's own state, not only the box on the screen.
    expect(screen.getByTestId("state").textContent).toBe("- one\n  - two");
    await userEvent.setup().keyboard("{Shift>}{Tab}{/Shift}");
    expect(box.value).toBe("- one\n- two");
  });

  it("indents a plain line, and Enter on an empty nested item goes out", () => {
    render(<Box indent />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("box");
    fireEvent.change(box, { target: { value: "text\n  - " } });
    box.setSelectionRange(0, 0);
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box.value).toBe("  text\n  - ");
    box.setSelectionRange(box.value.length, box.value.length);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("  text\n- ");
  });

  it("puts a tab at the caret after text, and Shift+Tab takes it back", () => {
    render(<Box indent />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("box");
    fireEvent.change(box, { target: { value: "text" } });
    box.setSelectionRange(4, 4);
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box.value).toBe("text\t");
    fireEvent.keyDown(box, { key: "Tab", shiftKey: true });
    expect(box.value).toBe("text");
  });

  it("leaves Tab alone in a box that is not for notes", () => {
    render(<Box />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("box");
    expect(fireEvent.keyDown(box, { key: "Tab" })).toBe(true);
    expect(box.value).toBe("- one\n- two");
  });
});
