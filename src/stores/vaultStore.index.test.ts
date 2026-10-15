import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createIndexPage: vi.fn(),
  createStandardNote: vi.fn(),
  getTree: vi.fn(),
  listProjects: vi.fn(),
  readNote: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

describe("index pages and standard notes", () => {
  const refreshTree = vi.fn().mockResolvedValue(undefined);
  const openNote = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ toasts: [] });
    useVaultStore.setState({ refreshTree, openNote });
  });

  it("creating an index page saves first, refreshes the tree, opens the page and says so", async () => {
    api.createIndexPage.mockResolvedValue("Work/Work index.md");
    const path = await useVaultStore.getState().createIndexPage("Work");
    expect(path).toBe("Work/Work index.md");
    expect(api.createIndexPage).toHaveBeenCalledWith("Work");
    expect(refreshTree).toHaveBeenCalled();
    expect(openNote).toHaveBeenCalledWith("Work/Work index.md");
    expect(useUiStore.getState().toasts.at(-1)?.message).toBe("Index page updated");
  });

  it("a failed index page is reported and nothing is opened", async () => {
    api.createIndexPage.mockRejectedValue(new Error("not a folder"));
    expect(await useVaultStore.getState().createIndexPage("Nope")).toBeNull();
    expect(openNote).not.toHaveBeenCalled();
  });

  it("a standard note is created, shown in the tree and opened", async () => {
    api.createStandardNote.mockResolvedValue("Quick notes/2026-10-13 14-32.md");
    const path = await useVaultStore.getState().createStandardNote("quick");
    expect(api.createStandardNote).toHaveBeenCalledWith("quick", undefined);
    expect(path).toBe("Quick notes/2026-10-13 14-32.md");
    expect(openNote).toHaveBeenCalledWith("Quick notes/2026-10-13 14-32.md");
  });
});
