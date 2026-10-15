import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultInfo } from "@/bindings/VaultInfo";

const api = vi.hoisted(() => ({ listTemplates: vi.fn(), updateVaultConfig: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { VaultSettingsTab } from "./VaultSettingsTab";
import { useVaultStore } from "@/stores/vaultStore";

const vault: VaultInfo = {
  name: "Notes",
  path: "/notes",
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

describe("VaultSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTemplates.mockResolvedValue([{ name: "Meeting", path: ".vault/templates/Meeting.md" }]);
    api.updateVaultConfig.mockImplementation((c: VaultInfo["config"]) => Promise.resolve(c));
    useVaultStore.setState({ vault: null });
  });

  it("asks for a vault when none is open", () => {
    render(<VaultSettingsTab />);
    expect(screen.getByText("Open a vault to change its settings.")).toBeInTheDocument();
  });

  it("saves the edited daily folder and format", async () => {
    useVaultStore.setState({ vault });
    render(<VaultSettingsTab />);
    const user = userEvent.setup();

    const folder = screen.getByLabelText("Daily notes folder (empty = vault root)");
    await user.clear(folder);
    await user.type(folder, "Journal");
    await user.selectOptions(screen.getByLabelText("Daily note date format"), "%d %b %Y");
    await user.click(screen.getByRole("button", { name: "Save vault settings" }));

    await waitFor(() => {
      expect(api.updateVaultConfig).toHaveBeenCalledTimes(1);
    });
    expect(api.updateVaultConfig.mock.calls[0]?.[0]).toMatchObject({
      dailyNotesFolder: "Journal",
      dailyNoteFormat: "%d %b %Y",
    });
  });

  it("a custom format shows a text field and saves what is typed", async () => {
    useVaultStore.setState({ vault });
    render(<VaultSettingsTab />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Daily note date format"), "custom");
    const custom = screen.getByLabelText("Custom date format");
    await user.clear(custom);
    await user.type(custom, "%Y/%m/%d");
    await user.click(screen.getByRole("button", { name: "Save vault settings" }));

    await waitFor(() => {
      expect(api.updateVaultConfig).toHaveBeenCalled();
    });
    expect(api.updateVaultConfig.mock.calls[0]?.[0]).toMatchObject({
      dailyNoteFormat: "%Y/%m/%d",
    });
  });

  it("offers the vault's templates as the daily note template", async () => {
    useVaultStore.setState({ vault });
    render(<VaultSettingsTab />);
    const user = userEvent.setup();
    await screen.findByRole("option", { name: "Meeting" });
    await user.selectOptions(screen.getByLabelText("Daily note template"), "Meeting");
    await user.click(screen.getByRole("button", { name: "Save vault settings" }));

    await waitFor(() => {
      expect(api.updateVaultConfig).toHaveBeenCalled();
    });
    expect(api.updateVaultConfig.mock.calls[0]?.[0]).toMatchObject({ dailyTemplate: "Meeting" });
  });

  it("saves how images are inserted", async () => {
    useVaultStore.setState({ vault });
    render(<VaultSettingsTab />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Insert images as"), "wiki");
    await user.click(screen.getByRole("button", { name: "Save vault settings" }));
    await waitFor(() => {
      expect(api.updateVaultConfig).toHaveBeenCalled();
    });
    expect(api.updateVaultConfig.mock.calls[0]?.[0]).toMatchObject({ imageLinkStyle: "wiki" });
  });
});
