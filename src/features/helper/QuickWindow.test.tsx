import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  taskAddLog: vi.fn(),
  quickClose: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: e instanceof Error ? e.message : "" }),
}));
const events = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/event", () => events);
vi.mock("@/features/capture/CaptureBox", () => ({
  CaptureBox: ({ kind }: { kind: string }) => <p>Box for {kind}</p>,
}));

import { QuickWindow } from "./QuickWindow";

describe("QuickWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.quickClose.mockResolvedValue(undefined);
    apiMock.taskAddLog.mockResolvedValue([]);
    apiMock.listEpics.mockResolvedValue([]);
    apiMock.getSettings.mockRejectedValue(new Error("none"));
  });

  it("writes something down in the same box as in Mimer, for a task or an idea", async () => {
    render(<QuickWindow mode="note" />);
    expect(await screen.findByText("Box for task")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "idea" }));
    expect(screen.getByText("Box for idea")).toBeInTheDocument();
  });

  it("says to open a vault when none is open", async () => {
    apiMock.listEpics.mockRejectedValue(new Error("No vault is open"));
    render(<QuickWindow mode="note" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Open a vault in Mimer first");
  });

  it("writes where you left off in the log of the task, the one in progress first", async () => {
    apiMock.listTasks.mockResolvedValue([
      makeTask({ title: "Plain one", line: 1, key: "a" }),
      makeTask({ title: "In progress", line: 2, key: "b", status: "doing" }),
      makeTask({ title: "Finished", line: 3, key: "c", done: true }),
    ]);
    render(<QuickWindow mode="park" />);
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Next step");
    expect(screen.getByRole("combobox")).toHaveValue("Møder/Acme.md:2");
    expect(screen.queryByRole("option", { name: "Finished" })).toBeNull();
    await user.type(box, "Back up the config first");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.taskAddLog).toHaveBeenCalledWith(
        "Møder/Acme.md",
        2,
        "b",
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "Left off: Back up the config first",
      );
    });
    expect(events.emit).toHaveBeenCalledWith("helper://changed");
    await waitFor(() => {
      expect(apiMock.quickClose).toHaveBeenCalled();
    });
  });

  it("says so when there is no open task, and closes with Escape", async () => {
    apiMock.listTasks.mockResolvedValue([]);
    render(<QuickWindow mode="park" />);
    expect(await screen.findByText(/no open task/)).toBeInTheDocument();
    await userEvent.setup().keyboard("{Escape}");
    expect(apiMock.quickClose).toHaveBeenCalled();
  });
});
