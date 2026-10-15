import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportEvent } from "@/bindings/ImportEvent";
import type { ImportPlan } from "@/bindings/ImportPlan";
import type { ImportReport } from "@/bindings/ImportReport";

const api = vi.hoisted(() => ({
  scanImport: vi.fn(),
  runImport: vi.fn(),
  cancelImport: vi.fn(),
}));
const dialogs = vi.hoisted(() => ({ pickFolder: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { ImportDialog } from "./ImportDialog";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const plan: ImportPlan = {
  sourceName: "OneNote export",
  files: [
    { path: "Work/Plan.md", size: 100, isNote: true },
    { path: "Work/pic.png", size: 2048, isNote: false },
  ],
  skipped: [{ path: ".hidden", reason: "hidden" }],
  renamed: [{ from: "Bad:name.md", to: "Bad-name.md" }],
  notes: 1,
  attachments: 1,
  totalBytes: 2148,
};

const report: ImportReport = {
  importedNotes: 1,
  importedAttachments: 1,
  renamed: [],
  skipped: [],
  brokenLinks: 2,
  cancelled: false,
  destFolder: "Imported/OneNote export",
  commit: "abc1234",
};

async function openAndChoose(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<ImportDialog />);
  await user.click(screen.getByRole("button", { name: "Choose folder…" }));
  await screen.findByText(/1 notes and 1 attachments/);
  return user;
}

describe("ImportDialog", () => {
  const refreshTree = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    dialogs.pickFolder.mockResolvedValue("/home/me/OneNote export");
    api.scanImport.mockResolvedValue(plan);
    api.runImport.mockResolvedValue(report);
    api.cancelImport.mockResolvedValue(undefined);
    useVaultStore.setState({ refreshTree });
    useUiStore.setState({ importOpen: true });
  });

  it("scans the chosen folder and previews what will happen", async () => {
    await openAndChoose();
    expect(api.scanImport).toHaveBeenCalledWith("/home/me/OneNote export");
    expect(screen.getByLabelText("Put them in this vault folder")).toHaveValue(
      "Imported/OneNote export",
    );
    expect(screen.getByText(/Names that will change \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Left out \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("imports into the folder the user typed, shows progress and then the report", async () => {
    let finish: (r: ImportReport) => void = () => undefined;
    api.runImport.mockImplementation(
      (_s: string, _d: string, onEvent: (e: ImportEvent) => void) =>
        new Promise<ImportReport>((resolve) => {
          onEvent({ type: "progress", done: 1, total: 2 });
          finish = resolve;
        }),
    );
    const user = await openAndChoose();
    const dest = screen.getByLabelText("Put them in this vault folder");
    await user.clear(dest);
    await user.type(dest, "Archive/OneNote");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(api.runImport.mock.calls[0]?.slice(0, 2)).toEqual([
      "/home/me/OneNote export",
      "Archive/OneNote",
    ]);
    expect(await screen.findByText(/1 of 2 files/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Import progress" })).toHaveAttribute(
      "value",
      "1",
    );

    finish(report);
    expect(await screen.findByText(/Import finished/)).toBeInTheDocument();
    expect(
      screen.getByText(/2 links point at notes that are not in the vault/),
    ).toBeInTheDocument();
    expect(refreshTree).toHaveBeenCalled();
  });

  it("can be cancelled while it runs, and cannot be closed by accident", async () => {
    api.runImport.mockImplementation(() => new Promise<ImportReport>(() => undefined));
    const user = await openAndChoose();
    await user.click(screen.getByRole("button", { name: "Import" }));
    await user.click(await screen.findByRole("button", { name: "Cancel import" }));
    expect(api.cancelImport).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(useUiStore.getState().importOpen).toBe(true);
  });

  it("does not offer Import without a destination or when the folder has nothing to import", async () => {
    const user = await openAndChoose();
    await user.clear(screen.getByLabelText("Put them in this vault folder"));
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("explains an empty folder", async () => {
    api.scanImport.mockResolvedValue({ ...plan, files: [], notes: 0, attachments: 0 });
    const user = userEvent.setup();
    render(<ImportDialog />);
    await user.click(screen.getByRole("button", { name: "Choose folder…" }));
    expect(await screen.findByText(/nothing to import/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("shows a scan error and lets the user choose again", async () => {
    api.scanImport.mockRejectedValue(new Error("Choose a folder outside the vault."));
    const user = userEvent.setup();
    render(<ImportDialog />);
    await user.click(screen.getByRole("button", { name: "Choose folder…" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("outside the vault");
    expect(screen.getByRole("button", { name: "Choose folder…" })).toBeEnabled();
  });

  it("shows an import error and returns to the preview", async () => {
    api.runImport.mockRejectedValue(new Error("Enter a folder name"));
    const user = await openAndChoose();
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a folder name");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    });
  });

  it("does nothing when the folder picker is cancelled", async () => {
    dialogs.pickFolder.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<ImportDialog />);
    await user.click(screen.getByRole("button", { name: "Choose folder…" }));
    expect(api.scanImport).not.toHaveBeenCalled();
  });
});
