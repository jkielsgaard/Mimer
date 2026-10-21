import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  taskAdd: vi.fn(),
  taskSetDone: vi.fn(),
  taskSetMeta: vi.fn(),
  taskAddStep: vi.fn(),
  taskAddLog: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) =>
    typeof e === "object" && e !== null && "code" in e
      ? e
      : { code: "Unknown", message: String(e) },
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { findTask, INBOX_PATH, useTaskStore } from "./taskStore";
import { useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

describe("taskStore", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    useTaskStore.setState({ tasks: [], loaded: false, selected: null });
    useVaultStore.setState({ activePath: null, reloadNonce: 0 });
    useUiStore.setState({ toasts: [], centerView: "tasks" });
  });

  it("loads every task", async () => {
    apiMock.listTasks.mockResolvedValue([makeTask()]);
    apiMock.listEpics.mockResolvedValue([]);
    await useTaskStore.getState().load();
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().loaded).toBe(true);
  });

  it("adds a task with the date word turned into a due date", async () => {
    apiMock.taskAdd.mockResolvedValue([makeTask({ path: INBOX_PATH, title: "Call Mette" })]);
    apiMock.listTasks.mockResolvedValue([makeTask({ path: INBOX_PATH, title: "Call Mette" })]);
    apiMock.listEpics.mockResolvedValue([]);
    await useTaskStore.getState().add("Call Mette today");
    const sent = apiMock.taskAdd.mock.calls[0]?.[0] as string;
    expect(sent).toMatch(/^Call Mette due:\d{4}-\d{2}-\d{2}$/);
    expect(useTaskStore.getState().tasks[0]?.path).toBe(INBOX_PATH);
  });

  it("puts a task in the epic it is given, and makes an epic for a note once", async () => {
    apiMock.taskAdd.mockResolvedValue([makeTask({ path: "Tasks/VPN.md" })]);
    apiMock.listTasks.mockResolvedValue([]);
    apiMock.listEpics.mockResolvedValue([]);
    await useTaskStore.getState().add("Write it", undefined, undefined, "Tasks/VPN.md");
    expect(apiMock.taskAdd.mock.calls[0]?.[3]).toBe("Tasks/VPN.md");
  });

  it("replaces only the tasks of the changed note and reloads the note when it is open", async () => {
    useTaskStore.setState({
      tasks: [makeTask(), makeTask({ path: "Other.md", title: "Other" })],
    });
    useVaultStore.setState({ activePath: "Møder/Acme.md" });
    apiMock.taskSetDone.mockResolvedValue([makeTask({ done: true })]);
    await useTaskStore.getState().setDone("Møder/Acme.md", 5, "key-1", true);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.path === "Møder/Acme.md")?.done).toBe(true);
    expect(useVaultStore.getState().reloadNonce).toBe(1);
  });

  it("shows a conflict as a message and reads the list again", async () => {
    apiMock.taskSetDone.mockRejectedValue({ code: "Conflict", message: "The note changed" });
    apiMock.listTasks.mockResolvedValue([makeTask({ title: "Fresh" })]);
    await useTaskStore.getState().setDone("Møder/Acme.md", 5, "old", true);
    expect(useUiStore.getState().toasts[0]?.message).toBe("The note changed");
    await vi.waitFor(() => {
      expect(useTaskStore.getState().tasks[0]?.title).toBe("Fresh");
    });
  });

  it("writes a status in the log, using the new line key", async () => {
    const t = makeTask();
    apiMock.taskSetMeta.mockResolvedValue([makeTask({ key: "key-2", status: "waiting" })]);
    apiMock.taskAddLog.mockResolvedValue([makeTask({ key: "key-3", status: "waiting" })]);
    await useTaskStore.getState().setStatus(t, "waiting");
    expect(apiMock.taskSetMeta).toHaveBeenCalledWith("Møder/Acme.md", 5, "key-1", {
      status: "waiting",
    });
    expect(apiMock.taskAddLog.mock.calls[0]?.[2]).toBe("key-2");
    expect(apiMock.taskAddLog.mock.calls[0]?.[4]).toBe("Status: waiting");
  });

  it("plans a task for today or later", async () => {
    apiMock.taskSetMeta.mockResolvedValue([makeTask()]);
    await useTaskStore.getState().plan(makeTask(), "later");
    expect(apiMock.taskSetMeta.mock.calls[0]?.[3]).toEqual({ plan: "later" });
    await useTaskStore.getState().plan(makeTask(), "today");
    expect((apiMock.taskSetMeta.mock.calls[1]?.[3] as { plan: string }).plan).toMatch(/^\d{4}-/);
  });

  it("finds a task again when its line moved", () => {
    const tasks = [makeTask({ line: 9 })];
    expect(
      findTask(tasks, { path: "Møder/Acme.md", line: 5, title: "Renew the Acme licence" })?.line,
    ).toBe(9);
    expect(findTask(tasks, { path: "Møder/Acme.md", line: 5, title: "Gone" })).toBeNull();
    expect(findTask(tasks, null)).toBeNull();
  });
});
