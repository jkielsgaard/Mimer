import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetDone: vi.fn(),
  taskAdd: vi.fn(),
  taskAddStep: vi.fn(),
  taskMove: vi.fn(),
  taskAddLog: vi.fn(),
  taskSetMeta: vi.fn(),
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
    apiMock.taskAddLog.mockImplementation(() => Promise.resolve(useTaskStore.getState().tasks));
    // Setting the status leaves the tasks as they are in the test.
    apiMock.taskSetMeta.mockImplementation(() => Promise.resolve(useTaskStore.getState().tasks));
    localStorage.clear();
    askMock.mockReset();
    useTaskStore.setState({
      tasks: [task],
      selected: { path: task.path, line: task.line, title: task.title },
    });
    useUiStore.setState({ focusOpen: true, focusTimer: true, focusMinutes: 25 });
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

  it("shows the task worked on with its next step as Now, and finishes that step", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    const marked = screen.getByRole("region", { name: task.title });
    expect(within(marked).getByText("Working on it")).toBeInTheDocument();
    expect(within(marked).getByText("Now")).toBeInTheDocument();
    // It becomes Doing when Focus opens on it.
    await waitFor(() => {
      expect(apiMock.taskSetMeta).toHaveBeenCalledWith(task.path, 5, "key-1", { status: "doing" });
    });
    await user.click(screen.getByRole("button", { name: "Done, next step" }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 7, "s2", true);
  });

  it("shows the whole epic unfolded: any task can be folded, and the mark can move", async () => {
    const other = makeTask({
      line: 12,
      key: "k2",
      title: "Order the tokens",
      steps: [{ line: 13, text: "Ask for a price", done: false, key: "s9" }],
    });
    useTaskStore.setState({ tasks: [task, other] });
    render(<FocusMode />);
    const user = userEvent.setup();
    expect(screen.getByText("Ask for a price")).toBeInTheDocument();
    // Nothing is locked: the task worked on can be folded too.
    await user.click(screen.getByRole("button", { name: `Fold ${task.title}` }));
    expect(screen.queryByText(task.steps[0]?.text ?? "")).toBeNull();
    await user.click(screen.getByRole("button", { name: `Unfold ${task.title}` }));
    await user.click(screen.getByRole("button", { name: "Fold the rest" }));
    expect(screen.queryByText("Ask for a price")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Work on this" }));
    expect(useTaskStore.getState().selected?.title).toBe("Order the tokens");
  });

  it("adds a step and moves steps and tasks without leaving focus", async () => {
    const other = makeTask({ line: 12, key: "k2", title: "Order the tokens", steps: [] });
    useTaskStore.setState({ tasks: [task, other] });
    apiMock.taskAddStep.mockResolvedValue([task, other]);
    apiMock.taskMove.mockResolvedValue([task, other]);
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(`Add a step to ${task.title}`),
      "Send the invoice{Enter}",
    );
    expect(apiMock.taskAddStep).toHaveBeenCalled();
    expect(apiMock.taskAddStep.mock.calls[0]?.[3]).toBe("Send the invoice");
    // The first task cannot go up, the last cannot go down.
    expect(screen.getByRole("button", { name: `Move ${task.title} up` })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: `Move ${task.title} down` }));
    expect(apiMock.taskMove).toHaveBeenCalledWith(task.path, task.line, task.key, false);
    const firstStep = task.steps[0];
    if (firstStep) {
      await user.click(screen.getByRole("button", { name: `Move ${firstStep.text} down` }));
      expect(apiMock.taskMove).toHaveBeenCalledWith(
        task.path,
        firstStep.line,
        firstStep.key,
        false,
      );
    }
    expect(useUiStore.getState().focusOpen).toBe(true);
  });

  it("writes what has happened without leaving focus", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    const marked = screen.getByRole("region", { name: task.title });
    await user.type(within(marked).getByLabelText("What has happened"), "Peter has it{Enter}");
    expect(apiMock.taskAddLog.mock.calls.at(-1)?.[4]).toBe("Peter has it");
    expect(useUiStore.getState().focusOpen).toBe(true);
  });

  it("asks before ticking the task when its last step is done", async () => {
    useTaskStore.setState({
      tasks: [
        {
          ...task,
          steps: task.steps.map((s) => (s.key === "s3" ? s : { ...s, done: true })),
        },
      ],
    });
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Done, next step" }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 8, "s3", true);
    expect(screen.getByRole("alert")).toHaveTextContent("Tick the task too?");
    await user.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByRole("alert")).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "How long" }));
    await user.click(await screen.findByRole("menuitem", { name: /^15 min/ }));
    expect(screen.getByRole("timer")).toHaveTextContent("15:00");
    // The length is remembered for next time.
    expect(useUiStore.getState().focusMinutes).toBe(15);
    expect(localStorage.getItem("mimer.focusMinutes")).toBe("15");
  });

  it("takes any length with Custom…, from 1 to 180 minutes", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "How long" }));
    await user.click(await screen.findByRole("menuitem", { name: /Custom/ }));
    const box = await screen.findByRole("textbox");
    await user.clear(box);
    await user.type(box, "500");
    expect(screen.getByRole("button", { name: "Use it" })).toBeDisabled();
    await user.clear(box);
    await user.type(box, "35");
    await user.click(screen.getByRole("button", { name: "Use it" }));
    expect(screen.getByRole("timer")).toHaveTextContent("35:00");
  });

  it("hides the timer when it is turned off, remembers that, and brings it back", async () => {
    const { unmount } = render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Timer" }));
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start timer" })).toBeNull();
    // What to do now is still there.
    expect(screen.getByRole("button", { name: "Done, next step" })).toBeInTheDocument();
    expect(localStorage.getItem("mimer.focusTimer")).toBe("0");
    unmount();
    render(<FocusMode />);
    expect(screen.queryByRole("timer")).toBeNull();
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Timer" }));
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("ultra focus shows only the one task, with its timer, steps and log, and goes back", async () => {
    const other = makeTask({ title: "Another task in the epic", line: 20, key: "k2" });
    useTaskStore.setState({ tasks: [task, other] });
    render(<FocusMode />);
    const user = userEvent.setup();
    expect(screen.getByText("Another task in the epic")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ultra focus" }));
    expect(screen.queryByText("Another task in the epic")).toBeNull();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getAllByText("Write the steps for version 5").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("What has happened")).toBeInTheDocument();
    // The timer switch works here too.
    await user.click(screen.getByRole("checkbox", { name: "Timer" }));
    expect(screen.queryByRole("timer")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Back to the epic/ }));
    expect(screen.getByText("Another task in the epic")).toBeInTheDocument();
  });

  it("writes down a thing that popped up, as a task, without leaving the focus", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Task" }));
    await user.type(screen.getByLabelText("Write a task"), "Call the bank{Enter}");
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Call the bank");
    // It goes into the epic that is in focus, not into an Inbox.
    expect(apiMock.taskAdd.mock.calls[0]?.[3]).toBeTruthy();
    expect(await screen.findByText(/1 written down/)).toBeInTheDocument();
    expect(useUiStore.getState().focusOpen).toBe(true);
  });

  it("writes down an idea from + Idea", async () => {
    render(<FocusMode />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Write an idea")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Idea" }));
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
    await user.click(screen.getByRole("button", { name: /Leave focus/ }));
    expect(useUiStore.getState().focusOpen).toBe(false);
  });

  it("ticks the task and says the epic is done when it was the last open one", async () => {
    const all = { ...task, steps: task.steps.map((s) => ({ ...s, done: true })) };
    useTaskStore.setState({ tasks: [all] });
    apiMock.taskSetDone.mockResolvedValue([{ ...all, done: true }]);
    render(<FocusMode />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark the task as done" }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 5, "key-1", true);
    expect(await screen.findByText("Epic done")).toBeInTheDocument();
  });

  it("moves the mark to the next open task when a task is ticked", async () => {
    const all = { ...task, steps: task.steps.map((s) => ({ ...s, done: true })) };
    const next = makeTask({ line: 12, key: "k2", title: "Order the tokens" });
    useTaskStore.setState({ tasks: [all, next] });
    apiMock.taskSetDone.mockResolvedValue([{ ...all, done: true }, next]);
    render(<FocusMode />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark the task as done" }));
    await waitFor(() => {
      expect(useTaskStore.getState().selected?.title).toBe("Order the tokens");
    });
  });
});
