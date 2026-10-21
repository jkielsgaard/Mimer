import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ readNote: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
// The editor still holds the note that was open before.
const editor = vi.hoisted(() => ({ doc: "# Old note\n" }));
vi.mock("@/lib/editorViews", () => ({
  focusedView: () => ({ state: { doc: { toString: () => editor.doc } } }),
  goToLine: vi.fn(),
  startTag: vi.fn(),
}));

import { OutlinePanel } from "./OutlinePanel";
import { useVaultStore } from "@/stores/vaultStore";

describe("OutlinePanel", () => {
  beforeEach(() => {
    apiMock.readNote.mockImplementation((path: string) =>
      Promise.resolve({ path, content: `# ${path}\n\n## Part\n`, mtime: 1 }),
    );
    useVaultStore.setState({ activePath: "A.md" });
  });

  it("shows the headings of the note just opened, not of the one before", async () => {
    render(<OutlinePanel />);
    expect(await screen.findByRole("button", { name: "A.md" })).toBeInTheDocument();
    act(() => {
      useVaultStore.setState({ activePath: "B.md" });
    });
    expect(await screen.findByRole("button", { name: "B.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Old note" })).toBeNull();
  });
});
