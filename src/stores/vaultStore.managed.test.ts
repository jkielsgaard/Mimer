import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";
import { useWorkspaceStore } from "./workspaceStore";

describe("opening Ideas", () => {
  beforeEach(() => {
    useUiStore.setState({ centerView: "notes", leftTab: "files" });
  });

  it("goes to their area and never opens them as a note", async () => {
    const before = JSON.stringify(useWorkspaceStore.getState().layout);
    await useVaultStore.getState().openNote("Ideas.md");
    expect(useUiStore.getState().centerView).toBe("ideas");
    expect(JSON.stringify(useWorkspaceStore.getState().layout)).toBe(before);
  });
});
