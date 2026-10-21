import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ aiInline: vi.fn(), aiCancel: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
const blocked = vi.hoisted(() => ({ reason: null as string | null }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => blocked.reason }));
vi.mock("@/lib/wake", () => ({ wakeIfNeeded: () => Promise.resolve(null) }));

import { FieldAi } from "./FieldAi";

function Form() {
  return (
    <div>
      <textarea aria-label="Log" defaultValue="helo wrld" />
      <input aria-label="Name" data-no-ai defaultValue="a name" />
      <FieldAi />
    </div>
  );
}

describe("FieldAi", () => {
  beforeEach(() => {
    apiMock.aiInline.mockReset();
    blocked.reason = null;
  });

  it("offers the AI over selected text in a text box, and not in a box marked no-ai", async () => {
    render(<Form />);
    const log = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Log" });
    log.focus();
    act(() => {
      log.setSelectionRange(0, 9);
      log.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(await screen.findByRole("toolbar", { name: /AI commands/ })).toBeInTheDocument();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    act(() => {
      name.focus();
      name.setSelectionRange(0, 6);
      name.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: /AI commands/ })).toBeNull();
    });
  });

  it("keeps the bar while a button on it is pressed, so the command runs", async () => {
    apiMock.aiInline.mockImplementation(
      (_req: unknown, on: (e: { type: string; text?: string }) => void) => {
        on({ type: "textDelta", text: "hello world" });
        on({ type: "done" });
        return Promise.resolve("task-2");
      },
    );
    render(<Form />);
    const log = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Log" });
    log.focus();
    act(() => {
      log.setSelectionRange(0, 9);
      log.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    // A real click sends mousedown first; that must not take the bar away.
    await userEvent.setup().click(await screen.findByRole("button", { name: "Fix" }));
    await waitFor(() => {
      expect(apiMock.aiInline).toHaveBeenCalled();
    });
    expect(await screen.findByRole("button", { name: /Accept/ })).toBeInTheDocument();
  });

  it("fixes the text of the box with Ctrl+K, and only after the result is accepted", async () => {
    apiMock.aiInline.mockImplementation(
      (_req: unknown, on: (e: { type: string; text?: string }) => void) => {
        on({ type: "textDelta", text: "hello world" });
        on({ type: "done" });
        return Promise.resolve("task-1");
      },
    );
    render(<Form />);
    const log = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Log" });
    const user = userEvent.setup();
    log.focus();
    await user.keyboard("{Control>}k{/Control}");
    await user.click(await screen.findByRole("button", { name: /Fix spelling and grammar/ }));
    expect(log.value).toBe("helo wrld");
    expect(apiMock.aiInline.mock.calls[0]?.[0]).toMatchObject({
      command: "fixSpelling",
      text: "helo wrld",
    });
    await user.click(await screen.findByRole("button", { name: /Accept/ }));
    expect(log.value).toBe("hello world");
  });

  it("says why it cannot be used when there is no AI, and changes nothing", async () => {
    blocked.reason = "No AI is set up.";
    render(<Form />);
    const log = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Log" });
    log.focus();
    await userEvent.setup().keyboard("{Control>}k{/Control}");
    expect(await screen.findByText(/No AI is set up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix spelling and grammar/ })).toBeDisabled();
    expect(log.value).toBe("helo wrld");
  });
});
