import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

const api = vi.hoisted(() => ({
  missingVaults: vi.fn(),
  forgetVault: vi.fn(),
  getSettings: vi.fn(),
}));
const dialogs = vi.hoisted(() => ({ pickFolder: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { Welcome } from "./Welcome";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { makeSettings } from "@/test/settings";

function settings(recent: string[]): Settings {
  return makeSettings({
    recentVaults: recent,
    lastVault: recent[0] ?? null,
    ai: { defaultProviderId: "p", embeddings: { enabled: false, providerId: "p", model: "" } },
  });
}

describe("Welcome recent vaults", () => {
  const openVault = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    openVault.mockResolvedValue(true);
    api.missingVaults.mockResolvedValue(["/gone/Notes"]);
    api.forgetVault.mockResolvedValue(undefined);
    api.getSettings.mockResolvedValue(settings(["/here/Work"]));
    useVaultStore.setState({ openVault });
    useSettingsStore.setState({ settings: settings(["/gone/Notes", "/here/Work"]) });
  });

  it("marks a vault whose folder is gone and lets you remove it", async () => {
    render(<Welcome />);
    expect(await screen.findByText("Folder not found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove /gone/Notes from the list" }));
    expect(api.forgetVault).toHaveBeenCalledWith("/gone/Notes");
    await waitFor(() => {
      expect(screen.queryByText("/gone/Notes")).toBeNull();
    });
  });

  it("locates a moved vault: opens the new folder and drops the old entry", async () => {
    dialogs.pickFolder.mockResolvedValue("/new/Notes");
    render(<Welcome />);
    await userEvent.click(await screen.findByRole("button", { name: "Locate /gone/Notes" }));
    await waitFor(() => {
      expect(openVault).toHaveBeenCalledWith("/new/Notes");
      expect(api.forgetVault).toHaveBeenCalledWith("/gone/Notes");
    });
  });
});

describe("Welcome new vault", () => {
  const createVault = vi.fn().mockResolvedValue(true);
  const save = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    createVault.mockResolvedValue(true);
    save.mockResolvedValue(undefined);
    api.missingVaults.mockResolvedValue([]);
    dialogs.pickFolder.mockResolvedValue("/here");
    useVaultStore.setState({ createVault });
    useSettingsStore.setState({ settings: settings([]), save });
  });

  it("asks whether to trace the work, which is off unless chosen", async () => {
    render(<Welcome />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create new vault/ }));
    const box = await screen.findByRole("checkbox", { name: /Trace my work/ });
    expect(box).not.toBeChecked();
    await user.type(screen.getByRole("textbox"), "Work");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(createVault).toHaveBeenCalledWith("/here", "Work");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the setting when it is ticked", async () => {
    render(<Welcome />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create new vault/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Trace my work/ }));
    await user.type(screen.getByRole("textbox"), "Work");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ editor: expect.objectContaining({ traceWork: true }) }),
    );
    expect(createVault).toHaveBeenCalledWith("/here", "Work");
  });

  it("refuses a name Windows cannot keep, with the reason", async () => {
    render(<Welcome />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create new vault/ }));
    await user.type(await screen.findByRole("textbox"), "PAM div.");
    expect(await screen.findByRole("alert")).toHaveTextContent(/end with a dot/i);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});

describe("Welcome demo vault", () => {
  const createDemoVault = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    createDemoVault.mockResolvedValue(true);
    api.missingVaults.mockResolvedValue([]);
    dialogs.pickFolder.mockResolvedValue("/here");
    useVaultStore.setState({ createDemoVault });
    useSettingsStore.setState({ settings: settings([]) });
  });

  it("offers a demo vault, and makes it in the folder that is chosen", async () => {
    render(<Welcome />);
    expect(screen.getByText("New here?")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try the demo vault" }));
    await waitFor(() => {
      expect(createDemoVault).toHaveBeenCalledWith("/here");
    });
  });

  it("does nothing when the folder dialog is cancelled", async () => {
    dialogs.pickFolder.mockResolvedValue(null);
    render(<Welcome />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Try the demo vault" }));
    await waitFor(() => {
      expect(dialogs.pickFolder).toHaveBeenCalled();
    });
    expect(createDemoVault).not.toHaveBeenCalled();
  });
});
