import { EditorView } from "@codemirror/view";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  commitNow: vi.fn(),
  renameNoteQuietly: vi.fn(),
  getTree: vi.fn(),
  listProjects: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/events", () => ({ onFileChanged: () => Promise.resolve(() => undefined) }));

import { Editor } from "./Editor";
import { useTitleFollow } from "@/stores/titleFollowStore";
import { useVaultStore } from "@/stores/vaultStore";
import { activate, emptyLayout, openPath, useWorkspaceStore } from "@/stores/workspaceStore";

function view(container: HTMLElement): EditorView {
  const dom = container.querySelector<HTMLElement>(".cm-editor");
  const v = dom ? EditorView.findFromDOM(dom) : null;
  if (!v) throw new Error("no editor");
  return v;
}

describe("a new note takes the name of its title", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.readNote.mockResolvedValue({ path: "Untitled.md", content: "# ", mtime: 0 });
    api.writeNote.mockResolvedValue(undefined);
    api.commitNow.mockResolvedValue(null);
    api.renameNoteQuietly.mockResolvedValue(undefined);
    api.getTree.mockResolvedValue([]);
    api.listProjects.mockResolvedValue([]);
    useTitleFollow.getState().reset();
    useTitleFollow.getState().start("Untitled.md");
    useVaultStore.setState({ files: ["Untitled.md"], activePath: "Untitled.md", reloadNonce: 0 });
    useWorkspaceStore.setState({
      layout: activate(openPath(emptyLayout(), "Untitled.md"), "primary", "Untitled.md"),
    });
  });

  it("starts with the cursor after the # so the title can be typed at once", async () => {
    const { container } = render(<Editor paneId="primary" />);
    await waitFor(() => {
      expect(view(container).state.doc.toString()).toBe("# ");
    });
    expect(view(container).state.selection.main.head).toBe(2);
  });

  it("typing a title renames the file after a pause, without reloading or moving the cursor", async () => {
    const { container } = render(<Editor paneId="primary" />);
    await waitFor(() => {
      expect(view(container).state.doc.toString()).toBe("# ");
    });
    const v = view(container);
    v.dispatch({ changes: { from: 2, insert: "Weekly sync" }, selection: { anchor: 13 } });

    await waitFor(
      () => {
        expect(api.renameNoteQuietly).toHaveBeenCalledWith("Untitled.md", "Weekly sync.md");
      },
      { timeout: 6000 },
    );
    expect(api.writeNote).toHaveBeenCalledWith("Untitled.md", "# Weekly sync");

    await waitFor(() => {
      expect(useWorkspaceStore.getState().layout.panes[0]?.active).toBe("Weekly sync.md");
    });
    // The editor was not reloaded: same text, same cursor, the note was read only once.
    expect(api.readNote).toHaveBeenCalledTimes(1);
    expect(view(container).state.doc.toString()).toBe("# Weekly sync");
    expect(view(container).state.selection.main.head).toBe(13);
  }, 15000);

  it("does not rename a note that does not follow its title", async () => {
    useTitleFollow.getState().stop("Untitled.md");
    const { container } = render(<Editor paneId="primary" />);
    await waitFor(() => {
      expect(view(container).state.doc.toString()).toBe("# ");
    });
    view(container).dispatch({ changes: { from: 2, insert: "Plan" } });
    await waitFor(
      () => {
        expect(api.writeNote).toHaveBeenCalled();
      },
      { timeout: 4000 },
    );
    await new Promise((r) => setTimeout(r, 2000));
    expect(api.renameNoteQuietly).not.toHaveBeenCalled();
  }, 15000);
});
