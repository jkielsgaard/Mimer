import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import type { VaultInfo } from "@/bindings/VaultInfo";

const dialogs = vi.hoisted(() => ({ pickFolder: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { normalizeVaultPath, VaultSwitcher } from "./VaultSwitcher";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const vault: VaultInfo = {
  name: "Work",
  path: "/home/me/Work",
  config: {
    schemaVersion: 1,
    attachmentsFolder: "attachments",
    newNoteFolder: "",
    dailyNotesFolder: "Daily",
    dailyNoteFormat: "%Y-%m-%d",
    dailyTemplate: "",
    meetingsFolder: "Meetings",
    quickNotesFolder: "Quick notes",
    imageLinkStyle: "markdown",
  },
};

function settings(recent: string[]): Settings {
  return {
    schemaVersion: 1,
    recentVaults: recent,
    lastVault: recent[0] ?? null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "p",
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "p", model: "" },
      providers: [],
    },
  };
}

describe("normalizeVaultPath", () => {
  it("ignores trailing slashes and separator style", () => {
    expect(normalizeVaultPath("C:\\Notes\\Work\\")).toBe("C:/Notes/Work");
    expect(normalizeVaultPath("/home/me/Work/")).toBe("/home/me/Work");
  });
});

describe("VaultSwitcher", () => {
  const openVault = vi.fn().mockResolvedValue(true);
  const createVault = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({ vault, openVault, createVault });
    useSettingsStore.setState({
      settings: settings(["/home/me/Work", "/home/me/Private", "/home/me/Ideas/"]),
    });
    useUiStore.setState({ vaultSwitcherOpen: false });
  });

  it("shows the open vault's name and renders nothing without a vault", () => {
    const { rerender } = render(<VaultSwitcher />);
    expect(screen.getByRole("button", { name: "Switch vault" })).toHaveTextContent("Work");
    useVaultStore.setState({ vault: null });
    rerender(<VaultSwitcher />);
    expect(screen.queryByRole("button", { name: "Switch vault" })).toBeNull();
  });

  it("lists the recent vaults and marks the open one", async () => {
    render(<VaultSwitcher />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Switch vault" }));
    expect(await screen.findByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Ideas")).toBeInTheDocument();
    expect(screen.getByLabelText("Open now")).toBeInTheDocument();
  });

  it("picking another vault opens it; picking the open one does nothing", async () => {
    render(<VaultSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch vault" }));
    await user.click(await screen.findByText("Private"));
    expect(openVault).toHaveBeenCalledWith("/home/me/Private");

    openVault.mockClear();
    await user.click(screen.getByRole("button", { name: "Switch vault" }));
    const rows = await screen.findAllByRole("menuitem");
    await user.click(rows[0] as HTMLElement); // "Work", the open vault
    expect(openVault).not.toHaveBeenCalled();
  });

  it("opens another folder as a vault through the folder picker", async () => {
    dialogs.pickFolder.mockResolvedValue("/home/me/New");
    render(<VaultSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch vault" }));
    await user.click(await screen.findByText(/Open another folder as vault/));
    await waitFor(() => {
      expect(openVault).toHaveBeenCalledWith("/home/me/New");
    });
  });

  it("creates a new vault: pick the parent folder, then type a name", async () => {
    dialogs.pickFolder.mockResolvedValue("/home/me");
    render(<VaultSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch vault" }));
    await user.click(await screen.findByText(/Create new vault/));
    await user.type(await screen.findByLabelText(/Vault name/), "Projects");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(createVault).toHaveBeenCalledWith("/home/me", "Projects");
  });

  it("opens from the shortcut flag", async () => {
    render(<VaultSwitcher />);
    useUiStore.getState().setVaultSwitcherOpen(true);
    expect(await screen.findByText("Vaults")).toBeInTheDocument();
  });
});
