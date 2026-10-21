import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetDone: vi.fn(),
  taskAdd: vi.fn(),
  taskAddStep: vi.fn(),
  ideaAdd: vi.fn(),
}));
const askMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/askAi", () => ({ askAi: askMock }));

import { clock, FocusMode } from "./FocusMode";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

const task = makeTask({
  title: "Update the VPN client guide",
  steps: [
    { line: 6, text: "Open the old guide", done: true, key: "s1" },
    { line: 7, text: "Write the steps for version 5", done: false, key: "s2" },
    { line: 8, text: "Send it to Peter", done: false, key: "s3" },
  ],
});

describe("FocusMode", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.taskSetDone.mockResolvedValue([task]);
    apiMock.taskAdd.mockResolvedValue([task]);
    apiMock.taskAddStep.mockResolvedValue([task]);
    apiMock.ideaAdd.mockResolvedValue([]);
    localStorage.clear();
    askMock.mockReset();
    useTaskStore.setState({
      tasks: [task],
      selected: { path: task.path, line: task.line, title: task.title },
    });
    useUiStore.setState({ focusOpen: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes minutes and seconds", () => {
    expect(clock(25 * 60_000)).toBe("25:00");
    expect(clock(18 * 60_000 + 30_000)).toBe("18:30");
    expect(clock(0)).toBe("00:00");
    expect(clock(-5)).toBe("00:00");
  });

  it("shows only the next step and finishes it", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Write the steps for version 5")).toBeInTheDocument();
    expect(screen.queryByText("Send it to Peter")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done, next step" }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 7, "s2", true);
  });

  it("runs a timer that can be paused and counts down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FocusMode />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    await user.click(screen.getByRole("button", { name: "Start timer" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("23:5");
    await user.click(screen.getByRole("button", { name: "Pause timer" }));
    const paused = screen.getByRole("timer").textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole("timer").textContent).toBe(paused);
    await user.click(screen.getByRole("button", { name: "15 min" }));
    expect(screen.getByRole("timer")).toHaveTextContent("15:00");
  });

  it("writes down a thing that popped up, as a task for later, without leaving the focus", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Task" }));
    await user.type(screen.getByLabelText("Write a task"), "Call the bank{Enter}");
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Call the bank plan:later");
    expect(await screen.findByText(/1 written down/)).toBeInTheDocument();
    expect(useUiStore.getState().focusOpen).toBe(true);
  });

  it("writes down an idea by default", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Write an idea"), "A cheat sheet{Enter}");
    expect(apiMock.ideaAdd.mock.calls[0]?.[1]).toBe("A cheat sheet");
  });

  it("offers a smaller step when stuck, and adds it only when asked", async () => {
    askMock.mockReturnValue({
      promise: Promise.resolve("Open the guide and read the first paragraph"),
      cancel: vi.fn(),
    });
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Help me start" }));
    expect(
      await screen.findByText("Open the guide and read the first paragraph"),
    ).toBeInTheDocument();
    expect(apiMock.taskAddStep).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add it as a step" }));
    expect(apiMock.taskAddStep).toHaveBeenCalledWith(
      task.path,
      5,
      "key-1",
      "Open the guide and read the first paragraph",
    );
  });

  it("says when the AI cannot help, and closes on Back", async () => {
    askMock.mockImplementation(() => ({
      promise: Promise.reject(new Error("The built-in AI is not running.")),
      cancel: vi.fn(),
    }));
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Help me start" }));
    expect(await screen.findByText("The built-in AI is not running.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back to the task/ }));
    expect(useUiStore.getState().focusOpen).toBe(false);
  });

  it("marks the whole task done when every step is done", async () => {
    useTaskStore.setState({
      tasks: [{ ...task, steps: task.steps.map((s) => ({ ...s, done: true })) }],
    });
    render(<FocusMode />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark the task as done" }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 5, "key-1", true);
    expect(useUiStore.getState().focusOpen).toBe(false);
  });
});
