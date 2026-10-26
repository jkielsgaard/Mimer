import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetDone: vi.fn(),
  taskSetMeta: vi.fn(),
  taskAddStep: vi.fn(),
  taskAddLog: vi.fn(),
  taskEditLog: vi.fn(),
  taskDeleteLog: vi.fn(),
  taskSetNote: vi.fn(),
  taskDelete: vi.fn(),
  taskSetTitle: vi.fn(),
  taskMove: vi.fn(),
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

import { statusFacts, statusLogLines, TaskPage } from "./TaskPage";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

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
    { line: 8, date: "2026-10-14", text: "Mette wants 40 users.", key: "l1" },
    { line: 9, date: "2026-10-16", text: "Waiting for Peter.", key: "l2" },
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
    // The title is text, not a field: it opens only from the pencil.
    expect(screen.getByRole("heading", { name: "Renew the Acme licence" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Title of the task" })).toBeNull();
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

  it("changes the status (and writes it in the log), and has no due date, time or today", async () => {
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Doing" }));
    await waitFor(() => {
      expect(apiMock.taskSetMeta).toHaveBeenCalledWith(task.path, 5, "key-1", { status: "doing" });
    });
    await waitFor(() => {
      expect(apiMock.taskAddLog.mock.calls[0]?.[4]).toBe("Status: doing");
    });
    expect(screen.queryByLabelText("How long it takes")).toBeNull();
    expect(screen.queryByLabelText("Due date")).toBeNull();
    expect(screen.queryByRole("button", { name: /today's list/ })).toBeNull();
  });

  it("shows the day the task was made", () => {
    useTaskStore.setState({ tasks: [makeTask({ made: "2026-10-19" })] });
    render(<TaskPage />);
    expect(screen.getByText("Mon 19 Oct")).toBeInTheDocument();
  });

  it("goes back to its epic, and has no Focus button of its own", async () => {
    render(<TaskPage />);
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "Focus" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Acme" }));
    expect(useUiStore.getState().centerView).toBe("epic");
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
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    blocked.reason = null;
  });

  it("edits a step in place and moves it with the buttons or Alt+arrow", async () => {
    apiMock.taskSetTitle.mockResolvedValue([task]);
    apiMock.taskMove.mockResolvedValue([task]);
    render(<TaskPage />);
    const user = userEvent.setup();
    expect(screen.queryByRole("textbox", { name: /Text of the step/ })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Edit the step Ask Peter about a discount" }),
    );
    const step = screen.getByRole("textbox", {
      name: "Text of the step Ask Peter about a discount",
    });
    await user.clear(step);
    await user.type(step, "Ask Peter for 10%{Enter}");
    await waitFor(() => {
      expect(apiMock.taskSetTitle).toHaveBeenCalledWith(task.path, 7, "s2", "Ask Peter for 10%");
    });
    // Escape puts the text back and saves nothing.
    await user.click(screen.getByRole("button", { name: "Edit the step Send the price list" }));
    await user.type(
      screen.getByRole("textbox", { name: "Text of the step Send the price list" }),
      " later{Escape}",
    );
    expect(screen.queryByRole("textbox", { name: /Text of the step/ })).toBeNull();
    expect(apiMock.taskSetTitle).toHaveBeenCalledTimes(1);

    // The first step cannot go further up, the last not further down.
    expect(screen.getByRole("button", { name: "Move Send the price list up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Ask Peter about a discount down" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Ask Peter about a discount up" }));
    expect(apiMock.taskMove).toHaveBeenCalledWith(task.path, 7, "s2", true);
    screen.getByRole("button", { name: "Move Send the price list down" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(apiMock.taskMove).toHaveBeenCalledWith(task.path, 6, "s1", false);
  });

  it("renames the task from its title, and shows its Markdown inside the page", async () => {
    apiMock.taskSetTitle.mockResolvedValue([{ ...task, title: "Renew the licence" }]);
    apiMock.readNote.mockResolvedValue({
      content: "# Acme\n\n- [ ] Renew the Acme licence due:2026-11-01\n  - [ ] Ask Peter\n",
    });
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit the title" }));
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
  it("changes a log line and keeps the others", async () => {
    apiMock.taskEditLog.mockResolvedValue([task]);
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Change this line" })[0] as HTMLElement);
    const box = screen.getByRole("textbox", { name: "Text of the log line" });
    await user.clear(box);
    await user.type(box, "Peter said yes.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.taskEditLog).toHaveBeenCalledWith(
        task.path,
        9,
        "l2",
        "2026-10-16",
        "Peter said yes.",
      );
    });
  });

  it("deletes a log line only after asking once more", async () => {
    apiMock.taskDeleteLog.mockResolvedValue([task]);
    render(<TaskPage />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Delete this line" })[1] as HTMLElement);
    expect(apiMock.taskDeleteLog).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(apiMock.taskDeleteLog).toHaveBeenCalledWith(task.path, 8, "l1");
    });
  });

  it("saves the note of the task when the box is left, and only if it changed", async () => {
    apiMock.taskSetNote.mockResolvedValue([task]);
    render(<TaskPage />);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "Note" });
    await user.click(box);
    await user.tab();
    expect(apiMock.taskSetNote).not.toHaveBeenCalled();
    await user.type(box, "Ask about the price");
    await user.tab();
    expect(apiMock.taskSetNote).toHaveBeenCalledWith(task.path, 5, "key-1", "Ask about the price");
  });

  it("opens the note", async () => {
    const openNote = vi.fn().mockResolvedValue(undefined);
    useVaultStore.setState({ openNote });
    render(<TaskPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Open the note/ }));
    expect(openNote).toHaveBeenCalledWith(task.path);
  });
});

describe("the status line", () => {
  it("is built from the written log lines, not from Mimer's own status lines", () => {
    const t = makeTask({
      title: "Renew",
      due: "2026-11-01",
      log: [
        { line: 1, date: "2026-10-14", text: "Status: waiting", key: "a" },
        { line: 2, date: "2026-10-15", text: "Mette wants 40 users.", key: "b" },
      ],
      note: "The grey ones",
    });
    expect(statusLogLines(t).map((l) => l.text)).toEqual(["Mette wants 40 users."]);
    const facts = statusFacts(t, 0);
    expect(facts).toContain("Task: Renew");
    expect(facts).toContain("Note: The grey ones");
    expect(facts).toContain("2026-10-15 Mette wants 40 users.");
    expect(facts).not.toContain("2026-10-14");
  });

  it("only uses the latest lines of a long log", () => {
    const log = Array.from({ length: 25 }, (_, i) => ({
      line: i,
      date: "2026-10-01",
      text: `Line ${String(i)}`,
      key: String(i),
    }));
    const lines = statusLogLines(makeTask({ log }));
    expect(lines).toHaveLength(10);
    expect(lines[9]?.text).toBe("Line 24");
  });
});
