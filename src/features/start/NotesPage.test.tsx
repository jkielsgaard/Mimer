import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(() => Promise.resolve([])),
  listEpics: vi.fn(() => Promise.resolve([])),
  getEpicOrder: vi.fn(() => Promise.resolve([])),
  taggedNotes: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
const openFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", () => ({ openFile, newNoteInCurrentFolder: vi.fn() }));

import { NotesPage } from "./NotesPage";
import { useRecent } from "@/stores/recentStore";
import { useVaultStore } from "@/stores/vaultStore";

const file = (path: string, modified: number): TreeNode => ({
  name: path,
  path,
  isDir: false,
  children: [],
  modified,
});

describe("NotesPage", () => {
  beforeEach(() => {
    openFile.mockReset();
    useRecent.setState({ paths: ["Work/Hiring plan.md", "Ideas.md"] });
    useVaultStore.setState({
      tree: [
        file("Work/Hiring plan.md", 3000),
        file("Work/Offer to Acme.md", 2000),
        file("Reading list.md", 1000),
        file("Ideas.md", 5000),
      ],
      files: [],
    });
  });

  it("lists the recent notes and every note, newest first, without the hidden Ideas note", () => {
    render(<NotesPage />);
    expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All notes · 3" })).toBeInTheDocument();
    const names = screen
      .getAllByRole("button", { name: /Hiring|Offer|Reading/ })
      .map((b) => b.textContent);
    // Recent first (Hiring plan), then all notes by change time.
    expect(names[0]).toContain("Hiring plan");
    expect(screen.queryByRole("button", { name: /^Ideas/ })).toBeNull();
  });

  it("narrows the list by name and opens a note", async () => {
    render(<NotesPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Find a note"), "acme");
    expect(screen.getByRole("heading", { name: "All notes · 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Offer to Acme/ }));
    expect(openFile).toHaveBeenCalledWith("Work/Offer to Acme.md");
  });
});
