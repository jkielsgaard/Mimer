import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  taggedNotes: vi.fn(),
  noteSetTag: vi.fn(() => Promise.resolve([])),
  readNote: vi.fn(),
  listIdeas: vi.fn(() => Promise.resolve([])),
  listTasks: vi.fn(() => Promise.resolve([])),
  listEpics: vi.fn(() => Promise.resolve([])),
  getEpicOrder: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
const openFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({ openFile, newNoteInCurrentFolder: vi.fn() }));

import { StartPage } from "./StartPage";
import { useMeetingStore } from "@/stores/meetingStore";
import { useUiStore } from "@/stores/uiStore";
import { useRecent } from "@/stores/recentStore";
import { useStartStore } from "@/stores/startStore";
import { DEFAULT_LAYOUT } from "@/lib/startLayout";
import { useVaultStore } from "@/stores/vaultStore";
import type { TreeNode } from "@/bindings/TreeNode";

const file = (path: string, modified: number): TreeNode => ({
  name: path,
  path,
  isDir: false,
  children: [],
  modified,
});

describe("StartPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useStartStore.setState({ layout: DEFAULT_LAYOUT.map((p) => ({ ...p })), editing: false });
    openFile.mockReset();
    apiMock.taggedNotes
      .mockReset()
      .mockImplementation((tag: string) =>
        Promise.resolve(
          tag === "pinned"
            ? [{ path: "Ops/Runbook.md", mtime: 0, content: "---\ntags: [pinned]\n---\n" }]
            : [],
        ),
      );
    apiMock.readNote.mockReset().mockResolvedValue({
      path: "Work/Hiring plan.md",
      mtime: 0,
      content: "# Hiring plan\n\nWe need two engineers before Q1.\n",
    });
    useMeetingStore.setState({ meetings: [], loaded: true });
    useRecent.setState({
      paths: ["Work/Hiring plan.md", "Work/Offer.md", "Møder/Weekly.md", "Ideas.md"],
    });
    useVaultStore.setState({
      tree: [
        file("Work/Hiring plan.md", Date.now()),
        file("Work/Offer.md", Date.now()),
        file("Møder/Weekly.md", Date.now()),
        file("Ideas.md", Date.now()),
      ],
      files: [],
      reloadNonce: 0,
    });
  });

  it("continues with the last note, lists the recent ones and the pinned ones", async () => {
    render(<StartPage />);
    const user = userEvent.setup();
    expect(await screen.findByText("We need two engineers before Q1.")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    // The last note is the Continue card, not a row in the list; managed notes are left out.
    expect(screen.getByRole("button", { name: /Offer/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ideas/ })).toBeNull();
    expect(await screen.findByRole("button", { name: "Runbook" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(openFile).toHaveBeenCalledWith("Work/Hiring plan.md");
  });

  it("filters the recent notes by what they are", async () => {
    apiMock.taggedNotes.mockImplementation((tag: string) =>
      Promise.resolve(
        tag === "meeting"
          ? [
              {
                path: "Møder/Weekly.md",
                mtime: 0,
                content: "---\ntags: [meeting]\n---\n# Weekly\n",
              },
            ]
          : [],
      ),
    );
    render(<StartPage />);
    const user = userEvent.setup();
    await screen.findByText("Meeting");
    await user.click(screen.getByRole("button", { name: "Meetings" }));
    expect(screen.getByRole("button", { name: /Weekly/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Offer/ })).toBeNull();
  });

  it("unpins a note", async () => {
    render(<StartPage />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Unpin Runbook" }));
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Ops/Runbook.md", "pinned", false);
  });

  it("New offers a note, a meeting, a quick note, a task and an idea", async () => {
    render(<StartPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /New/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Meeting" }));
    expect(useUiStore.getState().meetingFormOpen).toBe(true);
    await user.click(screen.getByRole("button", { name: /New/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Task" }));
    expect(useUiStore.getState().captureKind).toBe("task");
    await user.click(screen.getByRole("button", { name: /New/ }));
    expect(await screen.findByRole("menuitem", { name: "Quick note" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Idea" })).toBeInTheDocument();
  });

  it("welcomes a new vault with three buttons instead of empty lists", async () => {
    useRecent.setState({ paths: [] });
    apiMock.taggedNotes.mockResolvedValue([]);
    render(<StartPage />);
    expect(await screen.findByText("Welcome to Mimer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New meeting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open a folder" })).toBeInTheDocument();
  });

  it("is rearranged with Customize: add, move, widen, remove and reset, and it is remembered", async () => {
    render(<StartPage />);
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Pinned" });
    // Nothing to change until Customize is pressed.
    expect(screen.queryByRole("button", { name: "Remove Pinned" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Customize/ }));

    await user.click(screen.getByRole("button", { name: /Add widget/ }));
    await user.click(await screen.findByRole("button", { name: "Add Areas" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("region", { name: "Areas" })).toBeInTheDocument();
    expect(useStartStore.getState().layout.map((p) => p.id)).toEqual([
      "continue",
      "recent",
      "pinned",
      "areas",
    ]);
    expect(JSON.parse(localStorage.getItem("mimer.startLayout") ?? "[]")).toHaveLength(4);

    // While arranging, the arrows are always shown, not only under the mouse.
    expect(screen.getByRole("button", { name: "Move Areas up" }).parentElement).toHaveClass(
      "opacity-100",
    );
    await user.click(screen.getByRole("button", { name: "Move Areas up" }));
    expect(useStartStore.getState().layout.map((p) => p.id)[2]).toBe("areas");
    const width = screen.getByRole("group", { name: "Width of Areas" });
    await user.click(within(width).getByRole("button", { name: "Full" }));
    expect(useStartStore.getState().layout[2]?.wide).toBe(true);

    await user.click(screen.getByRole("button", { name: "Remove Recent" }));
    expect(screen.queryByRole("region", { name: "Recent" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(useStartStore.getState().layout.map((p) => p.id)).toEqual([
      "continue",
      "recent",
      "pinned",
    ]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(useStartStore.getState().editing).toBe(false);
  });
});
