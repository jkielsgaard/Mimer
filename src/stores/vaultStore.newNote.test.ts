import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createNote: vi.fn(),
  writeNote: vi.fn(),
  renameNoteQuietly: vi.fn(),
  renamePath: vi.fn(),
  previewRename: vi.fn(),
  deletePath: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { consumeRename } from "@/lib/renameHint";
import { useTitleFollow } from "./titleFollowStore";
import { useVaultStore } from "./vaultStore";

describe("new notes that take the name of their title", () => {
  const refreshTree = vi.fn().mockResolvedValue(undefined);
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const openNote = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useTitleFollow.getState().reset();
    useVaultStore.setState({ refreshTree, refreshProjects, openNote });
    api.createNote.mockResolvedValue("Untitled.md");
    api.writeNote.mockResolvedValue(undefined);
    api.renameNoteQuietly.mockResolvedValue(undefined);
    api.previewRename.mockResolvedValue({ linkCount: 0 });
    api.renamePath.mockResolvedValue({ changedFiles: [] });
  });

  it("a note without a name starts on its title line and follows the title", async () => {
    await useVaultStore.getState().createNote("");
    expect(api.writeNote).toHaveBeenCalledWith("Untitled.md", "# ");
    expect(useTitleFollow.getState().has("Untitled.md")).toBe(true);
    expect(openNote).toHaveBeenCalledWith("Untitled.md");
  });

  it("a note the user named does not follow anything", async () => {
    api.createNote.mockResolvedValue("Plan.md");
    await useVaultStore.getState().createNote("", "Plan");
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(useTitleFollow.getState().has("Plan.md")).toBe(false);
  });

  it("renaming to the title is quiet, keeps following and leaves a hint for the editor", async () => {
    useTitleFollow.getState().start("Untitled.md");
    const ok = await useVaultStore.getState().renameNewNote("Untitled.md", "Roadmap.md");
    expect(ok).toBe(true);
    expect(api.renameNoteQuietly).toHaveBeenCalledWith("Untitled.md", "Roadmap.md");
    expect(api.renamePath).not.toHaveBeenCalled();
    expect(useTitleFollow.getState().has("Roadmap.md")).toBe(true);
    expect(useTitleFollow.getState().has("Untitled.md")).toBe(false);
    expect(consumeRename("Roadmap.md")).toBe("Untitled.md");
  });

  it("a failed rename leaves no hint and keeps following under the old name", async () => {
    useTitleFollow.getState().start("Untitled.md");
    api.renameNoteQuietly.mockRejectedValue(new Error("read-only"));
    expect(await useVaultStore.getState().renameNewNote("Untitled.md", "Roadmap.md")).toBe(false);
    expect(consumeRename("Roadmap.md")).toBeNull();
    expect(useTitleFollow.getState().has("Untitled.md")).toBe(true);
  });

  it("a name the user chooses in the tree ends the following; deleting does too", async () => {
    useTitleFollow.getState().start("Untitled.md");
    await useVaultStore.getState().renamePath("Untitled.md", "Mine.md");
    expect(useTitleFollow.getState().paths.size).toBe(0);

    useTitleFollow.getState().start("Untitled 1.md");
    await useVaultStore.getState().deletePath("Untitled 1.md");
    expect(useTitleFollow.getState().paths.size).toBe(0);
  });
});
