import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  noteTags: vi.fn(),
  noteSetTag: vi.fn(),
  allTags: vi.fn(),
  readNote: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { NoteMenu } from "./NoteMenu";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("NoteMenu", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.allTags.mockResolvedValue([]);
    apiMock.readNote.mockResolvedValue({ path: "Work/Plan.md", content: "# Plan\n", mtime: 0 });
    useVaultStore.setState({ reloadNonce: 0, tree: [], projects: [] });
    useUiStore.setState({ exportDialog: null });
  });

  it("opens the history and the export of the note", async () => {
    apiMock.noteTags.mockResolvedValue([]);
    render(<NoteMenu path="Work/Plan.md" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "History" }));
    expect(useUiStore.getState().rightTab).toBe("history");
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export…" }));
    expect(useUiStore.getState().exportDialog).toEqual({ path: "Work/Plan.md", isFolder: false });
  });

  it("pins a note to the start page and unpins it again", async () => {
    apiMock.noteTags.mockResolvedValue([]);
    apiMock.noteSetTag.mockImplementation(() => {
      apiMock.noteTags.mockResolvedValue(["pinned"]);
      return Promise.resolve(["pinned"]);
    });
    render(<NoteMenu path="Work/Plan.md" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "Pin to the start page" }));
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Plan.md", "pinned", true);
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "Unpin from the start page" }));
    expect(apiMock.noteSetTag).toHaveBeenLastCalledWith("Work/Plan.md", "pinned", false);
  });

  it("shows only the button for a note without a tag, and ticks a tag on from Tags…", async () => {
    apiMock.noteTags.mockResolvedValue([]);
    apiMock.noteSetTag.mockImplementation(() => {
      // The note is read again after the change, as it is on disk by then.
      apiMock.noteTags.mockResolvedValue(["epic"]);
      return Promise.resolve(["epic"]);
    });
    render(<NoteMenu path="Work/Plan.md" />);
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: /Take the tag/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "Tags…" }));
    await user.click(await screen.findByRole("checkbox", { name: /Epic/ }));
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Plan.md", "epic", true);
    expect(
      await screen.findByRole("button", { name: "Take the tag Epic off", hidden: true }),
    ).toBeInTheDocument();
    expect(useVaultStore.getState().reloadNonce).toBe(1);
  });

  it("takes a tag off with the cross on its chip", async () => {
    apiMock.noteTags.mockResolvedValue(["meeting", "own"]);
    apiMock.noteSetTag.mockImplementation(() => {
      apiMock.noteTags.mockResolvedValue(["own"]);
      return Promise.resolve(["own"]);
    });
    render(<NoteMenu path="Work/Weekly.md" />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Take the tag Meeting off" }));
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Weekly.md", "meeting", false);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Take the tag Meeting off" })).toBeNull();
    });
    // The person's own tag is a chip of its own kind and stays.
    expect(screen.getByRole("button", { name: "Take the tag own off" })).toBeInTheDocument();
  });

  it("shows Mimer's tags first with what they do, and the person's own tags as #name", async () => {
    apiMock.noteTags.mockResolvedValue(["vpn", "meeting"]);
    render(<NoteMenu path="Work/Weekly.md" />);
    const chips = await screen.findAllByRole("button", { name: /Take the tag/ });
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Take the tag Meeting off",
      "Take the tag vpn off",
    ]);
    expect(screen.getByText("Meeting").closest("span")).toHaveAttribute(
      "title",
      expect.stringContaining("Start meeting"),
    );
    expect(screen.getByText("#vpn")).toBeInTheDocument();
  });
});

describe("NoteMenu: your own tags", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    useVaultStore.setState({ reloadNonce: 0, tree: [], projects: [] });
    apiMock.noteTags.mockResolvedValue(["epic"]);
    apiMock.allTags.mockResolvedValue([
      { tag: "vpn", count: 4 },
      { tag: "budget", count: 2 },
      { tag: "epic", count: 1 },
    ]);
    apiMock.readNote.mockResolvedValue({
      path: "Work/Plan.md",
      content: "---\ntags: [epic]\n---\n# Plan\n\nAlso about #idea and #q4, not `#code`.\n",
      mtime: 0,
    });
    apiMock.noteSetTag.mockImplementation((_p: string, tag: string, on: boolean) =>
      Promise.resolve(on ? ["epic", tag] : []),
    );
  });

  const openTags = async () => {
    render(<NoteMenu path="Work/Plan.md" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for this note" }));
    await user.click(await screen.findByRole("menuitem", { name: "Tags…" }));
    return user;
  };

  it("adds a tag of your own, written as one lower-case word, and makes the list read again", async () => {
    const user = await openTags();
    await user.type(await screen.findByLabelText("Add a tag"), "#Customer-A{Enter}");
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Plan.md", "customer-a", true);
    expect(apiMock.allTags.mock.calls.length).toBeGreaterThan(1);
  });

  it("refuses text that is not a tag", async () => {
    const user = await openTags();
    await user.type(await screen.findByLabelText("Add a tag"), "two words{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("one word");
    expect(apiMock.noteSetTag).not.toHaveBeenCalled();
  });

  it("offers the tags the vault already has (not Mimer's, not the ones on the note) as a click", async () => {
    const user = await openTags();
    expect(await screen.findByText("Use a tag you already have")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add the tag vpn" })).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: "Add the tag budget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add the tag epic" })).toBeNull();
    await user.type(screen.getByLabelText("Add a tag"), "bu");
    expect(screen.queryByRole("button", { name: "Add the tag vpn" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add the tag budget" }));
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Plan.md", "budget", true);
  });

  it("writing epic puts on Mimer's tag and says so; the #tags in the text are listed", async () => {
    const user = await openTags();
    expect(await screen.findByText("In the text: #idea #q4")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add a tag"), "Meeting{Enter}");
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Work/Plan.md", "meeting", true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Mimer's tags");
  });
});
