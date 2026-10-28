import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./CaptureBox", () => ({
  CAPTURE_KINDS: {
    task: { title: "New task" },
    idea: { title: "New idea" },
    note: { title: "Quick note" },
  },
  CaptureBox: ({ kind }: { kind: string }) => <div>box for {kind}</div>,
}));

import { CapturePicker } from "./CapturePicker";

describe("CapturePicker", () => {
  it("shows three buttons and opens the box for the one pressed", async () => {
    render(<CapturePicker />);
    const user = userEvent.setup();
    expect(screen.queryByText(/box for/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Idea" }));
    expect(screen.getByText("box for idea")).toBeInTheDocument();
    expect(screen.getByText("New idea")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Task" }));
    expect(screen.getByText("box for task")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close the box" }));
    expect(screen.queryByText(/box for/)).toBeNull();
  });
});
