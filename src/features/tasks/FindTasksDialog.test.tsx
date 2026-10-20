import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  readNote: vi.fn(),
  taskAddToNote: vi.fn(),
  epicForNote: vi.fn(),
  listTasks: vi.fn(),
  listEpics: vi.fn(),
}));
const askMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/askAi", () => ({ askAi: askMock }));

import { FindTasksDialog } from "./FindTasksDialog";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { makeTask } from "@/test/taskFixtures";

describe("FindTasksDialog", () => {
  beforeEach(() => {
    apiMock.readNote.mockReset().mockResolvedValue({
      path: "Møder/Acme.md",
      content: "Peter sends the quote by friday.",
      mtime: 0,
    });
    apiMock.taskAddToNote.mockReset().mockResolvedValue([makeTask()]);
    apiMock.epicForNote
      .mockReset()
      .mockResolvedValue({ path: "Tasks/Acme.md", title: "Acme", source: "Møder/Acme" });
    apiMock.listTasks.mockReset().mockResolvedValue([]);
    apiMock.listEpics.mockReset().mockResolvedValue([]);
    askMock.mockReset().mockImplementation(() => ({
      promise: Promise.resolve("- Send the quote fri\n- Ask Lene for the template"),
      cancel: vi.fn(),
    }));
    useVaultStore.setState({ activePath: "Møder/Acme.md" });
    useUiStore.setState({
      findTasksOpen: true,
      findTasksOpts: { path: null, mode: "tasks" },
    });
  });

  it("reads the open note, shows the tasks it finds, and adds only the kept ones to the epic task of that note", async () => {
    render(<FindTasksDialog />);
    const user = userEvent.setup();
    expect(await screen.findByText("Send the quote fri")).toBeInTheDocument();
    expect(askMock.mock.calls[0]?.[1]).toBe("Peter sends the quote by friday.");
    expect(apiMock.taskAddToNote).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /Ask Lene/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 task to the epic task" }));
    await vi.waitFor(() => {
      expect(apiMock.taskAddToNote).toHaveBeenCalled();
    });
    const [path, texts] = apiMock.taskAddToNote.mock.calls[0] as [string, string[]];
    expect(path).toBe("Tasks/Acme.md");
    expect(apiMock.epicForNote).toHaveBeenCalledWith("Møder/Acme.md");
    // The date word became a due date, and no plan was added.
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^Send the quote due:\d{4}-\d{2}-\d{2}$/);
    expect(useUiStore.getState().findTasksOpen).toBe(false);
  });

  it("says so when the AI finds nothing, or is not available", async () => {
    askMock.mockImplementation(() => ({ promise: Promise.resolve("NONE"), cancel: vi.fn() }));
    const { unmount } = render(<FindTasksDialog />);
    expect(await screen.findByText(/found no tasks/)).toBeInTheDocument();
    unmount();
    askMock.mockImplementation(() => ({
      promise: Promise.reject(new Error("LM Studio is not reachable.")),
      cancel: vi.fn(),
    }));
    render(<FindTasksDialog />);
    expect(await screen.findByRole("alert")).toHaveTextContent("LM Studio is not reachable.");
  });

  it("is not shown without an open note", () => {
    useVaultStore.setState({ activePath: null });
    render(<FindTasksDialog />);
    expect(screen.queryByText("Find tasks in this note")).toBeNull();
  });
});
