import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetDone: vi.fn(),
  taskSetMeta: vi.fn(),
  taskAddStep: vi.fn(),
  taskAddLog: vi.fn(),
  taskDelete: vi.fn(),
  taskSetTitle: vi.fn(),
  readNote: vi.fn(),
  listTasks: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
const askMock = vi.hoisted(() => ({ askAi: vi.fn() }));
vi.mock("@/lib/askAi", () => askMock);
const blocked = vi.hoisted(() => ({ reason: null as string | null }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => blocked.reason }));

import { TaskPage } from "./TaskPage";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

const task = makeTask({
  title: "Renew the Acme licence",
  due: "2026-11-01",
  status: "waiting",
  tags: ["acme"],
  steps: [
    { line: 6, text: "Send the price list", done: true, key: "s1" },
    { line: 7, text: "Ask Peter about a discount", done: false, key: "s2" },
  ],
  log: [
    { line: 8, date: "2026-10-14", text: "Mette wants 40 users." },
    { line: 9, date: "2026-10-16", text: "Waiting for Peter." },
  ],
});

describe("TaskPage", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.taskSetDone.mockResolvedValue([task]);
    apiMock.taskSetMeta.mockResolvedValue([task]);
    apiMock.taskAddStep.mockResolvedValue([task]);
    apiMock.taskAddLog.mockResolvedValue([task]);
    useTaskStore.setState({
      tasks: [task],
      selected: { path: task.path, line: task.line, title: task.title },
    });
    useUiStore.setState({ centerView: "task", focusOpen: false });
  });

  it("shows the task with its progress, the next step and the log, newest first", () => {
    render(<TaskPage />);
    expect(screen.getByRole("textbox", { name: "Title of the task" })).toHaveValue(
      "Renew the Acme licence",
    );
    expect(screen.getByText(/Steps · 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    const log = screen.getAllByRole("listitem").map((l) => l.textContent);
    const first = log.findIndex((t) => t.includes("Waiting for Peter"));
    const second = log.findIndex((t) => t.includes("Mette wants 40 users"));
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
    expect(screen.getByRole("button", { name: "Waiting" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ticks a step, adds a step and adds to the log", async () => {
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Mark as done: Ask Peter/ }));
    expect(apiMock.taskSetDone).toHaveBeenCalledWith(task.path, 7, "s2", true);
    await user.type(screen.getByLabelText("Add a step"), "Send the quote{Enter}");
    expect(apiMock.taskAddStep).toHaveBeenCalledWith(task.path, 5, "key-1", "Send the quote");
    await user.type(screen.getByLabelText("Write what happened"), "Peter answered.{Enter}");
    expect(apiMock.taskAddLog.mock.calls[0]?.[4]).toBe("Peter answered.");
    expect(apiMock.taskAddLog.mock.calls[0]?.[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("changes the status (and writes it in the log), the date and the time", async () => {
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Doing" }));
    await waitFor(() => {
      expect(apiMock.taskSetMeta).toHaveBeenCalledWith(task.path, 5, "key-1", { status: "doing" });
    });
    await waitFor(() => {
      expect(apiMock.taskAddLog.mock.calls[0]?.[4]).toBe("Status: doing");
    });
    await user.selectOptions(screen.getByLabelText("How long it takes"), "25");
    expect(apiMock.taskSetMeta).toHaveBeenCalledWith(task.path, 5, "key-1", { estMinutes: 25 });
  });

  it("goes back to the list, and starts focus", async () => {
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Focus on this" }));
    expect(useUiStore.getState().focusOpen).toBe(true);
    await user.click(screen.getByRole("button", { name: /Tasks/ }));
    expect(useUiStore.getState().centerView).toBe("tasks");
  });

  it("deletes the task only after asking once more", async () => {
    apiMock.taskDelete.mockResolvedValue([]);
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(apiMock.taskDelete).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(apiMock.taskDelete).toHaveBeenCalledWith(task.path, task.line, task.key);
    });
    expect(useUiStore.getState().centerView).toBe("tasks");
  });

  it("writes a status line from the log, added only when asked", async () => {
    blocked.reason = null;
    askMock.askAi.mockReturnValue({
      promise: Promise.resolve("Waiting for Peter about the discount. Due 1 Nov."),
      cancel: vi.fn(),
    });
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Write a status line from the log/ }));
    expect(await screen.findByText(/Waiting for Peter about the discount/)).toBeInTheDocument();
    expect(String(askMock.askAi.mock.calls[0]?.[1])).toContain("2026-10-16 Waiting for Peter.");
    expect(apiMock.taskAddLog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add it to the log" }));
    await waitFor(() => {
      expect(apiMock.taskAddLog).toHaveBeenCalled();
    });
  });

  it("turns the AI buttons off, with the reason, when there is no AI", () => {
    blocked.reason = "No AI is set up.";
    render(<TaskPage />);
    expect(screen.getByRole("button", { name: /Break it down/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Write a status line/ })).toBeDisabled();
    // Everything else works.
    expect(screen.getByRole("button", { name: "Focus on this" })).toBeEnabled();
    blocked.reason = null;
  });

  it("renames the task from its title, and shows its Markdown inside the page", async () => {
    apiMock.taskSetTitle.mockResolvedValue([{ ...task, title: "Renew the licence" }]);
    apiMock.readNote.mockResolvedValue({
      content: "# Acme\n\n- [ ] Renew the Acme licence due:2026-11-01\n  - [ ] Ask Peter\n",
    });
    render(<TaskPage />);
    const user = userEvent.setup();
    const title = screen.getByRole("textbox", { name: "Title of the task" });
    await user.clear(title);
    await user.type(title, "Renew the licence{Enter}");
    await waitFor(() => {
      expect(apiMock.taskSetTitle).toHaveBeenCalledWith(
        task.path,
        task.line,
        task.key,
        "Renew the licence",
      );
    });
    await user.click(screen.getByRole("button", { name: "Show Markdown" }));
    expect(await screen.findByRole("region", { name: "Markdown of the task" })).toBeInTheDocument();
    expect(apiMock.readNote).toHaveBeenCalledWith(task.path);
  });

  it("says so when the task is gone", () => {
    useTaskStore.setState({ tasks: [], selected: { path: "x.md", line: 1, title: "Gone" } });
    render(<TaskPage />);
    expect(screen.getByText(/no longer there/)).toBeInTheDocument();
  });
});
