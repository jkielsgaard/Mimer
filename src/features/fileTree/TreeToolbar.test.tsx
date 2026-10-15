import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings/Project";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
const actions = vi.hoisted(() => ({ newNoteInCurrentFolder: vi.fn(), revealInTree: vi.fn() }));
vi.mock("@/lib/actions", () => actions);

import { TreeToolbar } from "./TreeToolbar";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const project: Project = {
  schemaVersion: 1,
  id: "p1",
  name: "Security",
  folder: "Work/Security",
  instructions: "",
  providerId: null,
  createdAt: "",
  updatedAt: "",
};

describe("TreeToolbar", () => {
  const createStandardNote = vi.fn().mockResolvedValue("x.md");
  const createFolder = vi.fn().mockResolvedValue("Ideas");

  beforeEach(() => {
    vi.clearAllMocks();
    createFolder.mockResolvedValue("Ideas");
    useVaultStore.setState({
      vault: null,
      files: [],
      tree: [],
      projects: [],
      activePath: null,
      selectedPath: null,
      createStandardNote,
      createFolder,
    });
    useTreeStore.setState({ expanded: new Set(), filter: "", sort: "name" });
    useUiStore.setState({ projectDialog: null, toasts: [] });
  });

  async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    render(<TreeToolbar />);
    await user.click(screen.getByRole("button", { name: "New" }));
    return user;
  }

  it("New → Note creates a note", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Note/ }));
    expect(actions.newNoteInCurrentFolder).toHaveBeenCalled();
  });

  it("New → Quick note is one click", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Quick note/ }));
    expect(createStandardNote).toHaveBeenCalledWith("quick");
  });

  it("New → Meeting note asks for a title", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Meeting note/ }));
    const box = screen.getByLabelText("Meeting title");
    await user.clear(box);
    await user.type(box, " Weekly sync ");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(createStandardNote).toHaveBeenCalledWith("meeting", "Weekly sync");
    });
  });

  it("New → Folder asks for a name and creates it", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Folder/ }));
    await user.type(screen.getByLabelText("Folder name"), "Ideas");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith("", "Ideas");
    });
    expect(useUiStore.getState().projectDialog).toBeNull();
  });

  it("New → Project creates the folder and opens the project settings for it", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Project/ }));
    await user.type(screen.getByLabelText("Project folder name"), "Ideas");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(useUiStore.getState().projectDialog).toEqual({ folder: "Ideas", project: null });
    });
  });

  it("a project cannot be made inside another project", async () => {
    useVaultStore.setState({
      projects: [project],
      files: ["Work/Security/a.md"],
      selectedPath: "Work/Security",
      activePath: null,
    });
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Project/ }));
    await user.type(screen.getByLabelText("Project folder name"), "Nested");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(useUiStore.getState().toasts.at(-1)?.message).toMatch(
        /cannot be inside another project/,
      );
    });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("collapse all and sort change the tree settings", async () => {
    useTreeStore.setState({ expanded: new Set(["A", "A/B"]) });
    render(<TreeToolbar />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse all folders" }));
    expect(useTreeStore.getState().expanded.size).toBe(0);
    await user.click(screen.getByRole("button", { name: "Sort" }));
    await user.click(await screen.findByRole("menuitem", { name: /Last changed/ }));
    expect(useTreeStore.getState().sort).toBe("modified");
  });

  it("the show-open-note button needs an open note and then reveals it", async () => {
    render(<TreeToolbar />);
    const button = screen.getByRole("button", { name: "Show the open note in the tree" });
    expect(button).toBeDisabled();
    useVaultStore.setState({ activePath: "Work/Plan.md" });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    await userEvent.setup().click(button);
    expect(actions.revealInTree).toHaveBeenCalledWith("Work/Plan.md");
  });
});
