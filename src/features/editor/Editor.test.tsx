import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  commitNow: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/events", () => ({
  onFileChanged: () => Promise.resolve(() => undefined),
}));

import { Editor } from "./Editor";
import { activate, emptyLayout, openPath, useWorkspaceStore } from "@/stores/workspaceStore";
import { useVaultStore } from "@/stores/vaultStore";

const notes: Record<string, string> = {
  "Work/Alpha.md": "# Alpha\n\nAlpha body text.\n",
  "Work/Beta.md": "# Beta\n\nBeta body text.\n",
};

/** The text currently shown in the editor, or "" before it has loaded. */
function editorText(container: HTMLElement): string {
  return container.querySelector(".cm-content")?.textContent ?? "";
}

/** Puts the primary pane on the two notes with `active` selected. */
function showTabs(active: string): void {
  let layout = openPath(openPath(emptyLayout(), "Work/Alpha.md"), "Work/Beta.md");
  layout = activate(layout, "primary", active);
  useWorkspaceStore.setState({ layout });
}

describe("Editor tab switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.readNote.mockImplementation((path: string) =>
      Promise.resolve({ path, content: notes[path] ?? "", mtime: 0 }),
    );
    api.writeNote.mockResolvedValue(undefined);
    api.commitNow.mockResolvedValue(null);
    useVaultStore.setState({ activePath: null, reloadNonce: 0 });
  });

  it("shows the active tab's note and swaps when another tab is activated", async () => {
    showTabs("Work/Alpha.md");
    const { container } = render(<Editor paneId="primary" />);
    await waitFor(() => {
      expect(editorText(container)).toContain("Alpha body text.");
    });

    showTabs("Work/Beta.md");
    await waitFor(() => {
      expect(editorText(container)).toContain("Beta body text.");
    });
    expect(editorText(container)).not.toContain("Alpha body text.");
  });

  it("returning to a tab shows its note again", async () => {
    showTabs("Work/Alpha.md");
    const { container } = render(<Editor paneId="primary" />);
    await waitFor(() => {
      expect(editorText(container)).toContain("Alpha body text.");
    });

    showTabs("Work/Beta.md");
    await waitFor(() => {
      expect(editorText(container)).toContain("Beta body text.");
    });

    showTabs("Work/Alpha.md");
    await waitFor(() => {
      expect(editorText(container)).toContain("Alpha body text.");
    });
    expect(api.readNote).toHaveBeenCalledWith("Work/Alpha.md");
  });

  it("a pane with no note shows no text", () => {
    useWorkspaceStore.setState({ layout: emptyLayout() });
    const { container } = render(<Editor paneId="primary" />);
    expect(editorText(container)).toBe("");
    expect(api.readNote).not.toHaveBeenCalled();
  });
});
