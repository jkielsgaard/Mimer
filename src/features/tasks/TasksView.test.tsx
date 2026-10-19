import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  taskAdd: vi.fn(),
  taskSetDone: vi.fn(),
  taskSetMeta: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { TasksView } from "./TasksView";
import { addDays, todayIso } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

describe("TasksView", () => {
  const today = todayIso();
  beforeEach(() => {
    localStorage.clear();
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.listTasks.mockResolvedValue([
      makeTask({
        line: 1,
        title: "Ask Peter",
        plan: today,
        estMinutes: 15,
        steps: [
          { line: 2, text: "a", done: true, key: "s" },
          { line: 3, text: "b", done: false, key: "s2" },
        ],
      }),
      makeTask({ line: 4, title: "Old thing", due: addDays(today, -3) }),
      makeTask({ line: 6, title: "Send quote", due: addDays(today, 2) }),
      makeTask({ line: 8, title: "Done thing", done: true }),
    ]);
    useTaskStore.setState({ tasks: [], loaded: false, groupBy: "when", showDone: false });
    useUiStore.setState({ centerView: "tasks", focusOpen: false });
  });

  it("shows today first, then what was left over, then the week, and hides done tasks", async () => {
    render(<TasksView />);
    const headings = (await screen.findAllByRole("heading", { level: 3 })).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Today · 1", "Moved from earlier · 1", "This week · 1"]);
    const todayList = screen.getByRole("region", { name: "Today" });
    expect(within(todayList).getByText("Ask Peter")).toBeInTheDocument();
    expect(within(todayList).getByText(/1 of 2 steps/)).toBeInTheDocument();
    expect(screen.queryByText("Done thing")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show done" }));
    expect(screen.getByText("Done thing")).toBeInTheDocument();
  });

  it("adds a task from the box and ticks one off", async () => {
    apiMock.taskAdd.mockResolvedValue([makeTask({ path: "Tasks.md", title: "Call Mette" })]);
    apiMock.taskSetDone.mockResolvedValue([makeTask({ line: 4, title: "Old thing", done: true })]);
    render(<TasksView />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Add a task"), "Call Mette{Enter}");
    expect(apiMock.taskAdd).toHaveBeenCalledWith(`Call Mette plan:${today}`);
    await user.click(screen.getByRole("checkbox", { name: /Mark as done: Old thing/ }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith("Møder/Acme.md", 4, "key-1", true);
  });

  it("puts one on today's list and starts focus on another", async () => {
    apiMock.taskSetMeta.mockResolvedValue([makeTask()]);
    render(<TasksView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Focus on Send quote" }));
    expect(useUiStore.getState().focusOpen).toBe(true);
    expect(useTaskStore.getState().selected?.title).toBe("Send quote");
    await user.click(screen.getByRole("button", { name: "Put on today's list: Send quote" }));
    expect((apiMock.taskSetMeta.mock.calls[0]?.[3] as { plan: string }).plan).toBe(today);
  });

  it("opens a task on its page", async () => {
    render(<TasksView />);
    await userEvent.setup().click(await screen.findByText("Send quote"));
    expect(useUiStore.getState().centerView).toBe("task");
    expect(useTaskStore.getState().selected?.title).toBe("Send quote");
  });

  it("shows the good morning note once a day", async () => {
    const { unmount } = render(<TasksView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Good morning/)).toBeNull();
    unmount();
    render(<TasksView />);
    await screen.findByText("Today · 1");
    expect(screen.queryByText(/Good morning/)).toBeNull();
  });

  it("groups by note", async () => {
    render(<TasksView />);
    const user = userEvent.setup();
    await screen.findByText("Today · 1");
    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByRole("heading", { name: /Møder\/Acme · 3/ })).toBeInTheDocument();
  });
});
