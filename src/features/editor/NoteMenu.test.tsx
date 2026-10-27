import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ noteTags: vi.fn(), noteSetTag: vi.fn() }));
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
      expect(screen.queryByRole("button", { name: /Take the tag/ })).toBeNull();
    });
  });
});
