import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ exportDocument: vi.fn(), exportPreviewHtml: vi.fn() }));
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));

import { ExportDialog } from "./ExportDialog";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({ files: ["Work/a.md", "Work/b.md"] });
    useUiStore.setState({ exportDialog: { path: "Work", isFolder: true } });
  });

  it("exports a folder as HTML to the chosen file", async () => {
    save.mockResolvedValue("/tmp/out/Work.html");
    api.exportDocument.mockResolvedValue({ notesIncluded: 2, bytesWritten: 10 });
    render(<ExportDialog />);
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Export…" }));
    await waitFor(() => expect(api.exportDocument).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Work.html" }));
    expect(api.exportDocument.mock.calls[0]?.[0]).toMatchObject({
      format: "html",
      scope: "folder",
      includeToc: true,
    });
  });

  it("does nothing when the save dialog is cancelled", async () => {
    save.mockResolvedValue(null);
    render(<ExportDialog />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Export…" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(api.exportDocument).not.toHaveBeenCalled();
  });

  it("PDF goes through the print view and does not ask for a file", async () => {
    api.exportPreviewHtml.mockResolvedValue("<html></html>");
    render(<ExportDialog />);
    await userEvent.setup().click(screen.getByLabelText(/PDF/));
    await userEvent.setup().click(screen.getByRole("button", { name: "Export…" }));
    await waitFor(() => expect(api.exportPreviewHtml).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });
});
