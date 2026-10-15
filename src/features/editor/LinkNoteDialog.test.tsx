import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkResolver } from "@/lib/links";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { LinkNoteDialog } from "./LinkNoteDialog";
import { useVaultStore } from "@/stores/vaultStore";

const files = ["Home.md", "Work/Plan.md", "Work/Notes.md", "Private/Notes.md", "Work/pic.png"];

describe("LinkNoteDialog", () => {
  const onPick = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({ files, resolver: new LinkResolver(files) });
  });

  const open = (initialQuery = "") =>
    render(<LinkNoteDialog open initialQuery={initialQuery} onPick={onPick} onClose={onClose} />);

  it("lists notes from every folder and leaves out attachments", () => {
    open();
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names.some((n) => n.includes("Home"))).toBe(true);
    expect(names.some((n) => n.includes("Plan"))).toBe(true);
    expect(names.some((n) => n.includes("pic"))).toBe(false);
  });

  it("Enter links the highlighted note by its name", async () => {
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Find a note to link to"), "pla");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("Plan");
    expect(onClose).toHaveBeenCalled();
  });

  it("a name that exists in two folders is linked by path so the right note is used", async () => {
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Find a note to link to"), "Private/Notes");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("Private/Notes");
  });

  it("the selected text pre-fills the search", () => {
    open("plan");
    expect(screen.getByLabelText("Find a note to link to")).toHaveValue("plan");
  });

  it("offers a link to a new note when nothing has that name", async () => {
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Find a note to link to"), "Brand new idea");
    const last = screen.getAllByRole("option").at(-1) as HTMLElement;
    expect(last).toHaveTextContent("Link to a new note “Brand new idea”");
    await user.click(screen.getByRole("button", { name: /Link to a new note/ }));
    expect(onPick).toHaveBeenCalledWith("Brand new idea");
  });

  it("does not offer a new note when the name already exists", async () => {
    open();
    await userEvent.setup().type(screen.getByLabelText("Find a note to link to"), "Home");
    expect(screen.queryByText(/Link to a new note/)).toBeNull();
  });

  it("arrow keys move the highlight", async () => {
    open();
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });
});
