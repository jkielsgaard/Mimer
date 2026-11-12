import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

vi.mock("@/lib/api", () => ({
  api: {},
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));

import { LeftOffPrompt } from "./LeftOffPrompt";
import { askNextStep } from "@/lib/focusTime";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

const task = makeTask({ title: "Upgrade the VPN gateway", status: "doing" });

describe("LeftOffPrompt", () => {
  const addLog = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    localStorage.clear();
    addLog.mockClear();
    useTaskStore.setState({
      tasks: [task],
      selected: { path: task.path, line: task.line, title: task.title },
      addLog,
    });
    useUiStore.setState({ focusOpen: true });
  });

  const leaveFocus = (): void => {
    act(() => {
      useUiStore.setState({ focusOpen: false });
    });
  };

  it("asks for the next step when Focus is left and writes it in the log", async () => {
    render(<LeftOffPrompt />);
    leaveFocus();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Next step/), "Take a backup first");
    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    await waitFor(() => {
      expect(addLog).toHaveBeenCalledWith(task, "Left off: Take a backup first");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("writes nothing when it is skipped, and does not ask before Focus was open", async () => {
    useUiStore.setState({ focusOpen: false });
    render(<LeftOffPrompt />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      useUiStore.setState({ focusOpen: true });
    });
    leaveFocus();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Skip" }));
    expect(addLog).not.toHaveBeenCalled();
  });

  it("can be told not to ask again, and then does not", async () => {
    render(<LeftOffPrompt />);
    leaveFocus();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /Do not ask me again/ }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(askNextStep()).toBe(false);
    act(() => {
      useUiStore.setState({ focusOpen: true });
    });
    leaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not ask about a task that is done", () => {
    useTaskStore.setState({ tasks: [{ ...task, done: true }] });
    render(<LeftOffPrompt />);
    leaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
