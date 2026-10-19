import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/bindings/ChatEvent";

const apiMock = vi.hoisted(() => ({ aiInline: vi.fn(), aiCancel: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));

import { InlineAiPopup } from "./InlineAiPopup";

const selection = { from: 0, to: 10, text: "Call 4040 if it fails.", x: 10, y: 10 };

/** The AI answers `text` at once. */
function answer(text: string): void {
  apiMock.aiInline.mockImplementation((_req: unknown, on: (e: ChatEvent) => void) => {
    on({ type: "textDelta", text });
    on({ type: "done" });
    return Promise.resolve("task");
  });
}

describe("InlineAiPopup", () => {
  beforeEach(() => {
    apiMock.aiInline.mockReset();
    apiMock.aiCancel.mockResolvedValue(undefined);
  });

  it("offers fixed commands and none that need typing", () => {
    render(
      <InlineAiPopup
        selection={selection}
        notePath="a.md"
        onAccept={vi.fn()}
        onFindTasks={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    for (const name of [
      /Fix spelling and grammar/,
      /Rewrite: simpler words/,
      /Translate to Danish/,
      /Explain this/,
      /Find tasks in it/,
    ]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("is off with the reason when there is no AI", () => {
    render(
      <InlineAiPopup
        selection={selection}
        notePath="a.md"
        aiOff="No AI is set up."
        onAccept={vi.fn()}
        onFindTasks={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("No AI is set up.");
    expect(screen.getByRole("button", { name: /Explain this/ })).toBeDisabled();
    expect(apiMock.aiInline).not.toHaveBeenCalled();
  });

  it("warns when a rewrite lost a number, and accepts the new text", async () => {
    answer("Call the desk if it fails.");
    const onAccept = vi.fn();
    render(
      <InlineAiPopup
        selection={selection}
        start={{ id: "clearer" }}
        notePath="a.md"
        onAccept={onAccept}
        onFindTasks={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Check: 4040 is gone");
    await userEvent.setup().click(screen.getByRole("button", { name: /Accept/ }));
    expect(onAccept).toHaveBeenCalledWith("Call the desk if it fails.", "Rewrite: clearer");
  });

  it("shows an explanation without changing the note", async () => {
    answer("It means you phone the service desk.");
    render(
      <InlineAiPopup
        selection={selection}
        start={{ id: "explain" }}
        notePath="a.md"
        onAccept={vi.fn()}
        onFindTasks={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText("It means you phone the service desk.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
  });

  it("closes when you click outside the menu, and with the close button", async () => {
    const onClose = vi.fn();
    render(
      <InlineAiPopup
        selection={selection}
        notePath="a.md"
        onAccept={vi.fn()}
        onFindTasks={vi.fn()}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close the menu" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hands the selection to the task finder", async () => {
    const onFindTasks = vi.fn();
    render(
      <InlineAiPopup
        selection={selection}
        notePath="a.md"
        onAccept={vi.fn()}
        onFindTasks={onFindTasks}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /Find tasks in it/ }));
    await waitFor(() => {
      expect(onFindTasks).toHaveBeenCalledWith("Call 4040 if it fails.");
    });
  });
});
