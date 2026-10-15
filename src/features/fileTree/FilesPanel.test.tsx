import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings/Project";
import type { TreeNode } from "@/bindings/TreeNode";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
const actions = vi.hoisted(() => ({
  newNoteInCurrentFolder: vi.fn(),
  revealInTree: vi.fn(),
  openFile: vi.fn(),
  openInSplit: vi.fn(),
}));
vi.mock("@/lib/actions", () => actions);

import { FilesPanel } from "./FilesPanel";
import { useRecent } from "@/stores/recentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Settings } from "@/bindings/Settings";
import { useTreeStore } from "@/stores/treeStore";
import { useVaultStore } from "@/stores/vaultStore";

const file = (path: string, modified = 0): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: false,
  children: [],
  modified,
});
const dir = (path: string, children: TreeNode[]): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: true,
  children,
  modified: 0,
});

const tree = [
  dir("Work", [
    dir("Work/Security", [
      file("Work/Security/Policy.md", 5),
      file("Work/Security/Firewall.md", 9),
    ]),
    file("Work/Plan.md", 1),
  ]),
  file("Home.md", 3),
];
const project: Project = {
  schemaVersion: 1,
  id: "p1",
  name: "Security docs",
  folder: "Work/Security",
  instructions: "",
  providerId: null,
  createdAt: "",
  updatedAt: "",
};

const settings = (recentNotes: number): Settings => ({
  schemaVersion: 1,
  recentVaults: [],
  lastVault: null,
  theme: "system",
  editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes },
  git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
  ai: {
    defaultProviderId: "p1",
    ravenProviderId: null,
    baseInstruction: "",
    allowOwnKnowledge: false,
    globalInstructions: "",
    embeddings: { enabled: false, providerId: "p1", model: "" },
    providers: [],
  },
});

describe("FilesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useTreeStore.setState({
      expanded: new Set(),
      filter: "",
      sort: "name",
      sectionOpen: {},
      projectOpen: {},
      multi: new Set(),
    });
    useSettingsStore.setState({ settings: settings(4) });
    useRecent.setState({ vaultPath: "/v", paths: ["Home.md", "Work/Plan.md"] });
    useVaultStore.setState({
      vault: null,
      tree,
      files: ["Home.md", "Work/Plan.md", "Work/Security/Policy.md", "Work/Security/Firewall.md"],
      projects: [project],
      activePath: null,
      selectedPath: null,
    });
  });

  it("shows note counts on folders, and no lock on projects", () => {
    useTreeStore.setState({ expanded: new Set(["Work"]) });
    render(<FilesPanel />);
    // Work now holds only Plan.md: the project inside it is listed under Projects.
    expect(screen.getByTestId("tree-Work")).toHaveTextContent("1");
    expect(screen.getByTestId("project-Work/Security")).toHaveTextContent("Security docs");
    expect(screen.queryByLabelText("Local AI only")).toBeNull();
  });

  it("a project is not part of All files, but its notes are listed under Projects", () => {
    useTreeStore.setState({ expanded: new Set(["Work"]), projectOpen: { "Work/Security": true } });
    render(<FilesPanel />);
    const all = screen.getByRole("tree", { name: "Files" });
    expect(all.querySelector('[data-tree-path="Work/Security"]')).toBeNull();
    expect(all.querySelector('[data-tree-path="Work/Security/Policy.md"]')).toBeNull();
    const projects = screen.getByRole("region", { name: "Projects" });
    expect(projects.querySelector('[data-tree-path="Work/Security/Policy.md"]')).not.toBeNull();
    expect(projects.querySelector('[data-tree-path="Work/Security/Firewall.md"]')).not.toBeNull();
  });

  it("opening and folding a project is remembered", async () => {
    render(<FilesPanel />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Security docs/ }));
    expect(screen.queryByTestId("tree-Work/Security/Policy.md")).toBeNull();
    expect(localStorage.getItem("mimer-project:Work/Security")).toBe("closed");
    await user.click(screen.getByRole("button", { name: /^Security docs/ }));
    expect(screen.getByTestId("tree-Work/Security/Policy.md")).toBeInTheDocument();
  });

  it("a new note can be started from the project, in the project folder", async () => {
    render(<FilesPanel />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "New note in Security docs" }));
    expect(await screen.findByRole("dialog", { name: "New note" })).toBeInTheDocument();
  });

  it("dropping a note on a project moves it into the project folder", () => {
    const renamePath = vi.fn().mockResolvedValue(true);
    useVaultStore.setState({ renamePath });
    render(<FilesPanel />);
    const data = { "application/x-mimer-path": "Home.md" };
    fireEvent.drop(screen.getByTestId("project-Work/Security"), {
      dataTransfer: {
        types: Object.keys(data),
        getData: () => data["application/x-mimer-path"],
      },
    });
    return vi.waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith("Home.md", "Work/Security/Home.md", undefined);
    });
  });

  it("the filter also searches inside projects and hides projects with no match", async () => {
    render(<FilesPanel />);
    await userEvent.setup().type(screen.getByLabelText("Filter the file tree"), "policy");
    const projects = screen.getByRole("region", { name: "Projects" });
    expect(projects.querySelector('[data-tree-path="Work/Security/Policy.md"]')).not.toBeNull();
    expect(projects.querySelector('[data-tree-path="Work/Security/Firewall.md"]')).toBeNull();
    await userEvent.setup().clear(screen.getByLabelText("Filter the file tree"));
    await userEvent.setup().type(screen.getByLabelText("Filter the file tree"), "zzzz");
    expect(screen.queryByTestId("project-Work/Security")).toBeNull();
  });

  it("the attachments folder is not in All files (pictures are in the Images tab)", () => {
    useVaultStore.setState({
      tree: [dir("attachments", [file("attachments/a.png")]), ...tree],
      vault: {
        path: "/v",
        name: "v",
        config: {
          schemaVersion: 1,
          attachmentsFolder: "attachments",
          newNoteFolder: "",
          meetingsFolder: "Meetings",
          quickNotesFolder: "Quick notes",
          dailyNotesFolder: "Daily",
          dailyNoteFormat: "YYYY-MM-DD",
          dailyTemplate: "",
          imageLinkStyle: "markdown",
        },
      },
    });
    render(<FilesPanel />);
    expect(screen.queryByTestId("tree-attachments")).toBeNull();
    expect(screen.getByTestId("tree-Home.md")).toBeInTheDocument();
  });

  it("right-clicking a project offers the same choices as a folder in All files", async () => {
    render(<FilesPanel />);
    fireEvent.contextMenu(screen.getByTestId("project-Work/Security"));
    for (const name of [
      "New note",
      "New folder",
      "Rename",
      "Delete",
      "Create index page",
      "Project settings",
      "Export…",
      "Reveal in file manager",
    ]) {
      expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  describe("selecting several items", () => {
    const ctrl = { ctrlKey: true };

    it("Ctrl+click ticks items without opening them, and a plain click clears the ticks", () => {
      render(<FilesPanel />);
      fireEvent.click(screen.getByTestId("tree-Home.md"), ctrl);
      fireEvent.click(screen.getByTestId("tree-Work"), ctrl);
      expect(actions.openFile).not.toHaveBeenCalled();
      expect(screen.getByTestId("tree-Home.md")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("tree-Work")).toHaveAttribute("aria-selected", "true");
      expect(useTreeStore.getState().multi.size).toBe(2);
      fireEvent.click(screen.getByTestId("tree-Home.md"));
      expect(useTreeStore.getState().multi.size).toBe(0);
      expect(actions.openFile).toHaveBeenCalledWith("Home.md");
    });

    it("Shift+click ticks everything between two items", () => {
      useTreeStore.setState({ expanded: new Set(["Work"]) });
      render(<FilesPanel />);
      fireEvent.click(screen.getByTestId("tree-Work/Plan.md"));
      fireEvent.click(screen.getByTestId("tree-Home.md"), { shiftKey: true });
      expect([...useTreeStore.getState().multi]).toEqual(["Work/Plan.md", "Home.md"]);
    });

    it("the menu of a ticked item deletes all ticked items after one question", async () => {
      const deletePath = vi.fn().mockResolvedValue(true);
      useVaultStore.setState({ deletePath });
      render(<FilesPanel />);
      fireEvent.click(screen.getByTestId("tree-Home.md"), ctrl);
      fireEvent.click(screen.getByTestId("tree-Work"), ctrl);
      fireEvent.contextMenu(screen.getByTestId("tree-Work"));
      await userEvent
        .setup()
        .click(await screen.findByRole("menuitem", { name: "Delete 2 items" }));
      expect(deletePath).not.toHaveBeenCalled();
      await userEvent.setup().click(await screen.findByRole("button", { name: "Delete" }));
      await vi.waitFor(() => {
        expect(deletePath).toHaveBeenCalledTimes(2);
      });
      expect(deletePath).toHaveBeenCalledWith("Home.md");
      expect(deletePath).toHaveBeenCalledWith("Work");
      expect(useTreeStore.getState().multi.size).toBe(0);
    });

    it("dragging a ticked item moves all of them, without asking about links for each", async () => {
      const renamePath = vi.fn().mockResolvedValue(true);
      useVaultStore.setState({ renamePath });
      useTreeStore.setState({
        expanded: new Set(["Work"]),
        multi: new Set(["Home.md", "Work/Plan.md"]),
      });
      render(<FilesPanel />);
      const data: Record<string, string> = {
        "application/x-mimer-path": "Home.md",
        "application/x-mimer-paths": JSON.stringify(["Home.md", "Work/Plan.md"]),
      };
      fireEvent.drop(screen.getByTestId("project-Work/Security"), {
        dataTransfer: { types: Object.keys(data), getData: (k: string) => data[k] ?? "" },
      });
      await vi.waitFor(() => {
        expect(renamePath).toHaveBeenCalledTimes(2);
      });
      expect(renamePath).toHaveBeenCalledWith("Home.md", "Work/Security/Home.md", true);
      expect(renamePath).toHaveBeenCalledWith("Work/Plan.md", "Work/Security/Plan.md", true);
    });
  });

  describe("my own order", () => {
    beforeEach(() => {
      useVaultStore.setState({ projects: [] });
      useTreeStore.setState({ sort: "manual", order: { "": ["Home.md", "Work"] } });
    });

    const rows = (): (string | null)[] =>
      within(screen.getByRole("tree", { name: "Files" }))
        .getAllByRole("treeitem")
        .map((r) => r.getAttribute("data-tree-path"));

    it("shows the chosen order, with a file before a folder", () => {
      render(<FilesPanel />);
      expect(rows()).toEqual(["Home.md", "Work"]);
    });

    it("does not pin Meetings and Quick notes to the top by itself", () => {
      useVaultStore.setState({
        tree: [dir("Archive", [file("Archive/a.md")]), dir("Meetings", [file("Meetings/m.md")])],
        vault: {
          path: "/v",
          name: "v",
          config: {
            schemaVersion: 1,
            attachmentsFolder: "attachments",
            newNoteFolder: "",
            meetingsFolder: "Meetings",
            quickNotesFolder: "Quick notes",
            dailyNotesFolder: "Daily",
            dailyNoteFormat: "YYYY-MM-DD",
            dailyTemplate: "",
            imageLinkStyle: "markdown",
          },
        },
      });
      useTreeStore.setState({ order: {} });
      render(<FilesPanel />);
      expect(rows()).toEqual(["Archive", "Meetings"]);
    });

    it("Move down in the menu saves the new order of the folder", async () => {
      const setFolderOrder = vi.fn().mockResolvedValue(undefined);
      useTreeStore.setState({ setFolderOrder });
      render(<FilesPanel />);
      fireEvent.contextMenu(screen.getByTestId("tree-Home.md"));
      await userEvent.setup().click(await screen.findByRole("menuitem", { name: "Move down" }));
      expect(setFolderOrder).toHaveBeenCalledWith("", ["Work", "Home.md"]);
    });

    it("Alt+ArrowUp moves an item up", () => {
      const setFolderOrder = vi.fn().mockResolvedValue(undefined);
      useTreeStore.setState({ setFolderOrder });
      render(<FilesPanel />);
      fireEvent.keyDown(screen.getByTestId("tree-Work"), { key: "ArrowUp", altKey: true });
      expect(setFolderOrder).toHaveBeenCalledWith("", ["Work", "Home.md"]);
    });

    it("the menu has no Move up / Move down when the order is by name", () => {
      useTreeStore.setState({ sort: "name" });
      render(<FilesPanel />);
      fireEvent.contextMenu(screen.getByTestId("tree-Home.md"));
      expect(screen.queryByRole("menuitem", { name: "Move down" })).toBeNull();
    });
  });

  it("Meetings and Quick notes are at the top of All files", () => {
    useVaultStore.setState({
      tree: [
        dir("Archive", [file("Archive/a.md")]),
        dir("Quick notes", [file("Quick notes/q.md")]),
        dir("Meetings", [file("Meetings/m.md")]),
        ...tree,
      ],
      vault: {
        path: "/v",
        name: "v",
        config: {
          schemaVersion: 1,
          attachmentsFolder: "attachments",
          newNoteFolder: "",
          meetingsFolder: "Meetings",
          quickNotesFolder: "Quick notes",
          dailyNotesFolder: "Daily",
          dailyNoteFormat: "YYYY-MM-DD",
          dailyTemplate: "",
          imageLinkStyle: "markdown",
        },
      },
    });
    render(<FilesPanel />);
    const rows = within(screen.getByRole("tree", { name: "Files" }))
      .getAllByRole("treeitem")
      .map((r) => r.getAttribute("data-tree-path"));
    expect(rows.slice(0, 3)).toEqual(["Meetings", "Quick notes", "Archive"]);
  });

  it("the Recent section shows as many notes as the setting allows", () => {
    useRecent.setState({ paths: ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"] });
    useSettingsStore.setState({ settings: settings(4) });
    render(<FilesPanel />);
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(within(recent).getAllByRole("button").length).toBe(1 + 4);
    expect(recent).not.toHaveTextContent(/\be\b/);
  });

  it("the Recent section is hidden when the setting is 0", () => {
    useSettingsStore.setState({ settings: settings(0) });
    render(<FilesPanel />);
    expect(screen.queryByRole("region", { name: "Recent" })).toBeNull();
  });

  it("filtering shows only matching notes with their folders open", async () => {
    render(<FilesPanel />);
    await userEvent.setup().type(screen.getByLabelText("Filter the file tree"), "firewall");
    expect(screen.getByTestId("tree-Work/Security/Firewall.md")).toBeInTheDocument();
    expect(screen.queryByTestId("tree-Home.md")).toBeNull();
    expect(screen.queryByTestId("tree-Work/Plan.md")).toBeNull();
  });

  it("says so when nothing matches, and Escape clears the filter", async () => {
    render(<FilesPanel />);
    const user = userEvent.setup();
    const box = screen.getByLabelText("Filter the file tree");
    await user.type(box, "zzzz");
    expect(screen.getByText(/No notes match “zzzz”/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(box).toHaveValue("");
    expect(screen.getByTestId("tree-Home.md")).toBeInTheDocument();
  });

  it("the Recent section lists the last notes and opens one", async () => {
    render(<FilesPanel />);
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(recent).toHaveTextContent("Home");
    expect(recent).toHaveTextContent("Plan");
    await userEvent.setup().click(screen.getByRole("button", { name: /^Home/ }));
    expect(actions.openFile).toHaveBeenCalledWith("Home.md");
  });

  it("the Projects section shows the project with its note count", () => {
    render(<FilesPanel />);
    const section = screen.getByRole("region", { name: "Projects" });
    expect(section).toHaveTextContent("Security docs");
    expect(section).toHaveTextContent("2");
  });

  it("a section can be folded and the choice is remembered", async () => {
    render(<FilesPanel />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Recent/ }));
    expect(screen.queryByRole("button", { name: /^Home/ })).toBeNull();
    expect(localStorage.getItem("mimer-section:recent")).toBe("closed");
  });

  it("without recent notes or projects those sections are not shown", () => {
    useRecent.setState({ paths: [] });
    useVaultStore.setState({ projects: [] });
    render(<FilesPanel />);
    expect(screen.queryByRole("region", { name: "Recent" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Projects" })).toBeNull();
  });

  it("sorting by last change puts the newest note first", () => {
    useTreeStore.setState({ sort: "modified", expanded: new Set(["Work", "Work/Security"]) });
    render(<FilesPanel />);
    const rows = screen.getAllByRole("treeitem").map((r) => r.getAttribute("data-tree-path"));
    expect(rows.indexOf("Work/Security/Firewall.md")).toBeLessThan(
      rows.indexOf("Work/Security/Policy.md"),
    );
  });
});
