import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  epicCreate: vi.fn(),
  taskSetDone: vi.fn(),
  taskAdd: vi.fn(),
  taskAddStep: vi.fn(),
  taskMove: vi.fn(),
  getEpicOrder: vi.fn(),
  setEpicOrder: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));

import { TasksView } from "./TasksView";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("TasksView", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.listTasks.mockResolvedValue([
      makeTask({
        path: "Tasks/VPN guide.md",
        line: 3,
        title: "Write the steps",
        made: "2026-10-19",
        steps: [{ line: 4, text: "Draft it", done: true, key: "s1" }],
      }),
      makeTask({ path: "Tasks/VPN guide.md", line: 4, title: "Test on a Mac", done: true }),
      makeTask({ path: "Tasks/Done one.md", line: 2, title: "Order headsets", done: true }),
      makeTask({ path: "Møder/Acme.md", line: 5, title: "Renew the licence" }),
    ]);
    apiMock.getEpicOrder.mockResolvedValue([]);
    apiMock.setEpicOrder.mockResolvedValue(undefined);
    apiMock.listEpics.mockResolvedValue([
      { path: "Tasks/VPN guide.md", title: "VPN guide", source: "IT/VPN client guide" },
      { path: "Tasks/Done one.md", title: "Office move", source: null },
      { path: "Tasks/Empty.md", title: "Empty one", source: null },
    ]);
    useTaskStore.setState({
      tasks: [],
      epics: [],
      epicOrder: [],
      loaded: false,
      folded: {},
      epicPath: null,
    });
    useUiStore.setState({ centerView: "tasks", focusOpen: false });
    useVaultStore.setState({ activePath: null });
  });

  it("shows every epic as a box with its progress, and moves a finished one to Done", async () => {
    render(<TasksView />);
    const vpn = await screen.findByRole("region", { name: "VPN guide" });
    expect(within(vpn).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(within(vpn).getByText("1 of 2")).toBeInTheDocument();
    expect(within(vpn).getByText("Write the steps")).toBeInTheDocument();
    // A note that only has tasks written in it is an epic too.
    expect(screen.getByRole("region", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Empty one" })).toBeInTheDocument();
    // The finished epic is under Done, and folded.
    expect(screen.getByRole("button", { name: "Done · 1" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Order headsets")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Done · 1" }));
    expect(screen.getByRole("region", { name: "Office move" })).toBeInTheDocument();
  });

  it("folds an epic and remembers it", async () => {
    render(<TasksView />);
    const user = userEvent.setup();
    await screen.findByText("Write the steps");
    await user.click(screen.getByRole("button", { name: "Fold VPN guide" }));
    expect(screen.queryByText("Write the steps")).toBeNull();
    expect(useTaskStore.getState().folded["Tasks/VPN guide.md"]).toBe(true);
    expect(localStorage.getItem("mimer.foldedEpics")).toContain("Tasks/VPN guide.md");
    await user.click(screen.getByRole("button", { name: "Unfold VPN guide" }));
    expect(screen.getByText("Write the steps")).toBeInTheDocument();
  });

  it("opens an epic, and makes a new one from a name", async () => {
    apiMock.epicCreate.mockResolvedValue({
      path: "Tasks/New one.md",
      title: "New one",
      source: null,
    });
    render(<TasksView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^VPN guide/ }));
    expect(useUiStore.getState().centerView).toBe("epic");
    await user.click(screen.getByRole("button", { name: /New epic task/ }));
    await user.type(screen.getByLabelText("Name"), "New one{Enter}");
    expect(apiMock.epicCreate).toHaveBeenCalledWith("New one");
  });

  it("has no Today or Later: only epics, tasks, steps and the day a task was made", async () => {
    render(<TasksView />);
    await screen.findByText("Write the steps");
    for (const gone of [/All open/, /Today/, /Later/, /Moved from earlier/, /Show done/]) {
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }
    expect(screen.getByText("1 of 1 · 19 Oct")).toBeInTheDocument();
  });

  it("folds and unfolds every epic at once", async () => {
    render(<TasksView />);
    const user = userEvent.setup();
    await screen.findByText("Write the steps");
    await user.click(screen.getByRole("button", { name: "Fold all" }));
    expect(screen.queryByText("Write the steps")).toBeNull();
    expect(screen.queryByText("Renew the licence")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Unfold all" }));
    expect(screen.getByText("Write the steps")).toBeInTheDocument();
  });

  it("shows a task's steps in the list, and adds a step and a task there", async () => {
    apiMock.taskAddStep.mockResolvedValue([]);
    apiMock.taskAdd.mockResolvedValue([]);
    render(<TasksView />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Show the steps of Write the steps" }),
    );
    expect(
      screen.getByRole("checkbox", { name: /Mark as not done: Draft it/ }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add a step to Write the steps"), "Check it{Enter}");
    expect(apiMock.taskAddStep).toHaveBeenCalledWith("Tasks/VPN guide.md", 3, "key-1", "Check it");
    await user.type(screen.getByLabelText("Add a task to VPN guide"), "Test on Linux{Enter}");
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Test on Linux");
    expect(apiMock.taskAdd.mock.calls[0]?.[3]).toBe("Tasks/VPN guide.md");
  });

  it("ticks a task off from its row", async () => {
    apiMock.taskSetDone.mockResolvedValue([
      makeTask({ path: "Møder/Acme.md", line: 5, done: true }),
    ]);
    render(<TasksView />);
    await userEvent
      .setup()
      .click(await screen.findByRole("checkbox", { name: /Mark as done: Renew the licence/ }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith("Møder/Acme.md", 5, "key-1", true);
  });
  it("moves epics and tasks up and down, and keeps the Inbox at the top", async () => {
    apiMock.listTasks.mockResolvedValue([
      makeTask({ path: "Tasks/Inbox.md", line: 2, title: "Call the bank", key: "i1" }),
      makeTask({ path: "Tasks/VPN guide.md", line: 3, title: "Write the steps", key: "a" }),
      makeTask({ path: "Tasks/VPN guide.md", line: 4, title: "Test on a Mac", key: "b" }),
      makeTask({ path: "Tasks/Office.md", line: 2, title: "Order desks" }),
    ]);
    apiMock.listEpics.mockResolvedValue([
      { path: "Tasks/Inbox.md", title: "Inbox", source: null },
      { path: "Tasks/VPN guide.md", title: "VPN guide", source: null },
      { path: "Tasks/Office.md", title: "Office move", source: null },
    ]);
    apiMock.taskMove.mockImplementation(() => Promise.resolve(useTaskStore.getState().tasks));
    render(<TasksView />);
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "VPN guide" });
    const names = () =>
      screen
        .getAllByRole("region")
        .map((r) => r.getAttribute("aria-label"))
        .filter((n) => n !== "Tasks");
    // Office move comes first by name, after the Inbox.
    expect(names()).toEqual(["Inbox", "Office move", "VPN guide"]);
    expect(screen.queryByRole("button", { name: "Move Inbox up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Office move up" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move VPN guide up" }));
    expect(apiMock.setEpicOrder).toHaveBeenCalledWith(["Tasks/VPN guide.md", "Tasks/Office.md"]);
    expect(names()).toEqual(["Inbox", "VPN guide", "Office move"]);

    await user.click(screen.getByRole("button", { name: "Move Write the steps down" }));
    expect(apiMock.taskMove).toHaveBeenCalledWith("Tasks/VPN guide.md", 3, "a", false);
    screen.getByRole("button", { name: "Test on a Mac" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(apiMock.taskMove).toHaveBeenCalledWith("Tasks/VPN guide.md", 4, "b", true);
  });
});
