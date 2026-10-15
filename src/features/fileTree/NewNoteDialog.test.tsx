import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { NewNoteDialog } from "./NewNoteDialog";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const node = (path: string, isDir: boolean, children: TreeNode[] = []): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir,
  children,
  modified: 0,
});

describe("NewNoteDialog", () => {
  const createNote = vi.fn().mockResolvedValue("Work/Idea.md");

  beforeEach(() => {
    vi.clearAllMocks();
    createNote.mockResolvedValue("Work/Idea.md");
    useVaultStore.setState({
      tree: [node("Work", true, [node("Work/Plan.md", false)]), node("Untitled.md", false)],
      projects: [],
      createNote,
    });
    useUiStore.setState({ newNoteDialog: null });
  });

  it("is closed until a note is started", () => {
    render(<NewNoteDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("suggests a free name when Untitled is taken", () => {
    useUiStore.getState().openNewNoteDialog("");
    render(<NewNoteDialog />);
    expect(screen.getByRole("textbox")).toHaveValue("Untitled 1");
  });

  it("says clearly that a name is taken, and does not allow Create", async () => {
    useUiStore.getState().openNewNoteDialog("Work");
    render(<NewNoteDialog />);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "plan");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A note called “Plan” already exists in “Work”. Choose another name.",
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await user.type(box, "{Enter}");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("creates the note with its name as the first heading", async () => {
    useUiStore.getState().openNewNoteDialog("Work");
    render(<NewNoteDialog />);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Idea");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith("Work", "Idea", true);
    });
    expect(useUiStore.getState().newNoteDialog).toBeNull();
  });
});
