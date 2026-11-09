import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  backupNow: vi.fn(),
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
}));
const dialogs = vi.hoisted(() => ({ pickFolder: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { BackupSettings } from "./BackupSettings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { makeSettings } from "@/test/settings";

const VAULT = "/home/me/Notes";

function setup(backups = {}): void {
  const settings = makeSettings({ backups });
  api.getSettings.mockResolvedValue(settings);
  useSettingsStore.setState({ settings });
  useVaultStore.setState({
    vault: {
      name: "Notes",
      path: VAULT,
      config: {
        schemaVersion: 1,
        attachmentsFolder: "attachments",
        newNoteFolder: "",
        dailyNotesFolder: "",
        dailyNoteFormat: "",
        dailyTemplate: "",
        meetingsFolder: "Meetings",
        quickNotesFolder: "Quick notes",
        imageLinkStyle: "markdown",
      },
    },
  });
}

describe("BackupSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateSettings.mockResolvedValue(undefined);
    api.backupNow.mockResolvedValue({ path: "/disk/Notes.git", commits: 3 });
  });

  it("starts with no folder: Back up now and the close box are off", () => {
    setup();
    render(<BackupSettings />);
    expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Back up when Mimer closes" })).toBeDisabled();
    expect(screen.getByText("Not backed up yet")).toBeInTheDocument();
  });

  it("saves the folder that is chosen, for this vault", async () => {
    setup();
    dialogs.pickFolder.mockResolvedValue("/disk/Backup");
    render(<BackupSettings />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Choose…" }));
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalled();
    });
    const saved = api.updateSettings.mock.calls[0]?.[0] as {
      backups: Record<string, { folder: string }>;
    };
    expect(saved.backups[VAULT]?.folder).toBe("/disk/Backup");
  });

  it("backs up on demand and reads the result again", async () => {
    setup({ [VAULT]: { folder: "/disk", onClose: false, lastOk: null, lastError: null } });
    const after = makeSettings({
      backups: {
        [VAULT]: {
          folder: "/disk",
          onClose: false,
          lastOk: new Date().toISOString(),
          lastError: null,
        },
      },
    });
    api.getSettings.mockResolvedValue(after);
    render(<BackupSettings />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back up now" }));
    expect(api.backupNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Backed up today/)).toBeInTheDocument();
  });

  it("shows why a backup failed, and saves the close choice", async () => {
    setup({
      [VAULT]: {
        folder: "/disk",
        onClose: false,
        lastOk: null,
        lastError: "The backup folder is not there (is the disk connected?). Choose it again.",
      },
    });
    render(<BackupSettings />);
    expect(screen.getByText(/is the disk connected/)).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "Back up when Mimer closes" }));
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalled();
    });
    const saved = api.updateSettings.mock.calls[0]?.[0] as {
      backups: Record<string, { onClose: boolean }>;
    };
    expect(saved.backups[VAULT]?.onClose).toBe(true);
  });
});
