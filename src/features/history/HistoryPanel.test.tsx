import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fileHistory: vi.fn(),
  fileAtCommit: vi.fn(),
  readNote: vi.fn(),
  restoreFile: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/events", () => ({ onCommitted: () => Promise.resolve(() => undefined) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/components/DiffView", () => ({ DiffView: () => null }));

import { HistoryPanel } from "./HistoryPanel";
import { useVaultStore } from "@/stores/vaultStore";

const entries = [
  {
    sha: "aaaa111",
    shortSha: "aaaa111",
    path: "Work/Plan.md",
    message: "Save: Work/Plan.md",
    time: 1_900_000_000,
  },
  {
    sha: "bbbb222",
    shortSha: "bbbb222",
    path: "Work/Plan.md",
    message: "Autosave: Work/Plan.md",
    time: 1_899_000_000,
  },
];

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fileHistory.mockResolvedValue(entries);
    api.fileAtCommit.mockResolvedValue("old text");
    api.readNote.mockResolvedValue({ path: "Work/Plan.md", content: "current text", mtime: 0 });
    api.restoreFile.mockResolvedValue(undefined);
    useVaultStore.setState({ activePath: null });
  });

  it("asks for a note when none is open", () => {
    render(<HistoryPanel />);
    expect(screen.getByText("Open a note to see its history.")).toBeInTheDocument();
    expect(api.fileHistory).not.toHaveBeenCalled();
  });

  it("lists the commits that touched the open note", async () => {
    useVaultStore.setState({ activePath: "Work/Plan.md" });
    render(<HistoryPanel />);
    expect(await screen.findByText("Save: Work/Plan.md")).toBeInTheDocument();
    expect(screen.getByText("Autosave: Work/Plan.md")).toBeInTheDocument();
    expect(api.fileHistory).toHaveBeenCalledWith("Work/Plan.md");
  });

  it("selecting a version offers to restore it", async () => {
    useVaultStore.setState({ activePath: "Work/Plan.md" });
    render(<HistoryPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Autosave: Work/Plan.md"));

    await waitFor(() => {
      expect(api.fileAtCommit).toHaveBeenCalledWith("Work/Plan.md", "bbbb222");
    });
    await user.click(screen.getByRole("button", { name: /Restore this version/ }));
    await waitFor(() => {
      expect(api.restoreFile).toHaveBeenCalledWith("Work/Plan.md", "bbbb222");
    });
  });

  it("says so when the note has no saved versions", async () => {
    api.fileHistory.mockResolvedValue([]);
    useVaultStore.setState({ activePath: "New.md" });
    render(<HistoryPanel />);
    expect(await screen.findByText(/No saved versions yet/)).toBeInTheDocument();
  });
});
