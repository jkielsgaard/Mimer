import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  getEpicOrder: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { TasksPanel } from "./TasksPanel";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

describe("TasksPanel", () => {
  beforeEach(() => {
    apiMock.listTasks
      .mockReset()
      .mockResolvedValue([
        makeTask({ path: "Tasks/A.md", title: "One" }),
        makeTask({ path: "Tasks/A.md", line: 6, title: "Two", done: true }),
        makeTask({ path: "Tasks/B.md", title: "Three", done: true }),
      ]);
    apiMock.listEpics.mockReset().mockResolvedValue([
      { path: "Tasks/A.md", title: "Alpha", source: null },
      { path: "Tasks/B.md", title: "Beta", source: null },
    ]);
    useTaskStore.setState({ tasks: [], epics: [], loaded: false, epicPath: null });
    useUiStore.setState({ centerView: "tasks" });
  });

  it("lists the epics with their count, done ones last, and opens one", async () => {
    render(<TasksPanel />);
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: /Alpha/ })).toHaveTextContent("1/2");
    expect(screen.getByRole("heading", { name: "Done · 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(useUiStore.getState().centerView).toBe("epic");
    expect(useTaskStore.getState().epicPath).toBe("Tasks/A.md");
  });

  it("has no filters and no box for writing a task", async () => {
    render(<TasksPanel />);
    await screen.findByRole("button", { name: /Alpha/ });
    expect(screen.queryByLabelText("Add a task here")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /All open|Moved from earlier|This week/ }),
    ).toBeNull();
  });
});
