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
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

function settings(recent: string[]): Settings {
  return {
    schemaVersion: 1,
    recentVaults: recent,
    lastVault: recent[0] ?? null,
    theme: "system",
    editor: {
      fontSize: 15,
      lineWidth: 760,
      spellcheck: true,
      recentNotes: 4,
      aiSpelling: false,
      traceWork: false,
      ownWords: [],
    },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "p",
      checkAnswers: false,
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "" },
      baseInstruction: "",
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "p", model: "" },
      providers: [],
    },
  };
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
