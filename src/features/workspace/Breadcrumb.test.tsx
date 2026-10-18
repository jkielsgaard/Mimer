import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings/Project";

const apiMock = vi.hoisted(() => ({ readNote: vi.fn(), backlinks: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
const actions = vi.hoisted(() => ({ revealInTree: vi.fn() }));
vi.mock("@/lib/actions", () => actions);

import { Breadcrumb, countWords } from "./Breadcrumb";
import { useVaultStore } from "@/stores/vaultStore";

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

describe("Breadcrumb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.readNote.mockResolvedValue({ path: "x", content: "one two three", mtime: 0 });
    apiMock.backlinks.mockResolvedValue([]);
    useVaultStore.setState({ projects: [] });
  });

  it("shows nothing without a note", () => {
    const { container } = render(<Breadcrumb path={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the folders and the note title", () => {
    render(<Breadcrumb path="Work/Plans/Weekly sync.md" />);
    const nav = screen.getByRole("navigation", { name: "Location of the open note" });
    expect(nav).toHaveTextContent("Work");
    expect(nav).toHaveTextContent("Plans");
    expect(screen.getByText("Weekly sync")).toHaveAttribute("aria-current", "page");
  });

  it("a note in the vault root has only its title", () => {
    render(<Breadcrumb path="Home.md" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("a project shows under its name, and a folder click reveals it in the tree", async () => {
    useVaultStore.setState({ projects: [project] });
    render(<Breadcrumb path="Work/Security/Policies/Policy.md" />);
    expect(screen.getByRole("button", { name: "Security docs" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Policies" }));
    expect(actions.revealInTree).toHaveBeenCalledWith("Work/Security/Policies");
  });

  it("shows the word count and the number of backlinks", async () => {
    apiMock.readNote.mockResolvedValue({
      path: "A.md",
      content: "---\ntags: [a]\n---\nOne two three four.",
      mtime: 0,
    });
    apiMock.backlinks.mockResolvedValue([{}, {}]);
    render(<Breadcrumb path="Work/A.md" />);
    expect(await screen.findByTestId("note-facts")).toHaveTextContent(/4 words.*2 backlinks/);
  });
});

describe("countWords", () => {
  it("counts words and skips the front matter", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("a b\nc")).toBe(3);
    expect(countWords("---\ntitle: x\n---\nhello world")).toBe(2);
  });
});
