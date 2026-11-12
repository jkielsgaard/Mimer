import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetMeta: vi.fn(),
  taskAddLog: vi.fn(),
  taskHistoryAdd: vi.fn(),
  taskSetTitle: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { WaitingForTask } from "./WaitingForTask";
import { waitersOf } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";

const upgrade = makeTask({
  path: "IT/Network.md",
  line: 3,
  key: "k-up",
  title: "Upgrade the VPN gateway",
  status: "waiting",
});
const testSetup = makeTask({
  path: "IT/Network.md",
  line: 4,
  key: "k-test",
  title: "Prepare the test environment",
  steps: [
    { line: 5, text: "Install", done: true, key: "s1" },
    { line: 6, text: "Configure", done: false, key: "s2" },
  ],
});

describe("WaitingForTask", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.taskSetMeta.mockResolvedValue([upgrade, testSetup]);
    apiMock.taskAddLog.mockResolvedValue([upgrade, testSetup]);
    apiMock.taskHistoryAdd.mockResolvedValue([upgrade, testSetup]);
    useTaskStore.setState({ tasks: [upgrade, testSetup] });
  });

  it("finds a task by typing, never offers the task itself, and writes the link and the log", async () => {
    render(<WaitingForTask task={upgrade} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Waiting for a task…" }));
    await user.type(screen.getByRole("textbox", { name: "Search for a task" }), "test");
    expect(screen.queryByText("Upgrade the VPN gateway")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Prepare the test environment/ }));
    await waitFor(() => {
      expect(apiMock.taskSetMeta).toHaveBeenCalledWith("IT/Network.md", 3, "k-up", {
        after: "IT/Network#Prepare the test environment",
      });
    });
    await waitFor(() => {
      expect(apiMock.taskHistoryAdd.mock.calls[0]?.[3]).toBe(
        "Waiting for the task: Prepare the test environment",
      );
    });
  });

  it("shows the task it waits for, says Ready when that task is done, and lets the link go", async () => {
    const linked = { ...upgrade, after: "IT/Network#Prepare the test environment" };
    useTaskStore.setState({ tasks: [linked, testSetup] });
    const { rerender } = render(<WaitingForTask task={linked} />);
    expect(screen.getByText("Prepare the test environment")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 steps/)).toBeInTheDocument();
    expect(screen.queryByText("Ready")).toBeNull();
    useTaskStore.setState({ tasks: [linked, { ...testSetup, done: true }] });
    rerender(<WaitingForTask task={linked} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Stop waiting for this task" }));
    await waitFor(() => {
      expect(apiMock.taskSetMeta).toHaveBeenCalledWith("IT/Network.md", 3, "k-up", {
        after: null,
      });
    });
  });

  it("says so when the task it waits for is gone", () => {
    const linked = { ...upgrade, after: "IT/Network#Deleted task" };
    render(<WaitingForTask task={linked} />);
    expect(screen.getByText(/That task was not found/)).toBeInTheDocument();
  });
});

describe("what waits for a task", () => {
  it("lists the open tasks that wait for it, on its page and in the list", () => {
    const waiting = { ...upgrade, after: "IT/Network#Prepare the test environment" };
    const finished = {
      ...upgrade,
      line: 9,
      key: "k-x",
      title: "Old",
      after: waiting.after,
      done: true,
    };
    expect(waitersOf([waiting, testSetup, finished], testSetup).map((t) => t.title)).toEqual([
      "Upgrade the VPN gateway",
    ]);
    expect(waitersOf([waiting], upgrade)).toEqual([]);
  });
});

describe("renaming a task that others wait for", () => {
  it("reads the list again, because Mimer moved what points at it", async () => {
    const waiting = { ...upgrade, after: "IT/Network#Prepare the test environment" };
    const renamed = { ...testSetup, title: "Prepare the lab" };
    apiMock.taskSetTitle.mockResolvedValue([waiting, renamed]);
    const load = vi.fn().mockResolvedValue(undefined);
    useTaskStore.setState({ tasks: [waiting, testSetup], selected: null, load });
    await useTaskStore.getState().rename("IT/Network.md", 4, "k-test", "Prepare the lab");
    expect(load).toHaveBeenCalled();
    expect(apiMock.taskSetMeta).not.toHaveBeenCalled();
  });
});
