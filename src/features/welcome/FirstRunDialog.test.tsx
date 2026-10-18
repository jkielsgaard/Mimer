import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { FirstRunDialog } from "./FirstRunDialog";
import { needsAiSetup } from "./firstRun";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { engineStatus } from "@/test/engineFixtures";

const settings = (kind: string, id = "p"): Settings =>
  ({
    ai: { defaultProviderId: id, providers: [{ id, kind }] },
  }) as unknown as Settings;

describe("needsAiSetup", () => {
  it("is true for a built-in AI without a model, false when a model or another AI exists", () => {
    expect(needsAiSetup(settings("builtin"), 0, 0)).toBe(true);
    expect(needsAiSetup(settings("builtin"), 1, 0)).toBe(false);
    expect(needsAiSetup(settings("foundry_local"), 0, 0)).toBe(true);
    expect(needsAiSetup(settings("foundry_local"), 0, 2)).toBe(false);
    expect(needsAiSetup(settings("lmstudio"), 0, 0)).toBe(false);
  });
});

describe("FirstRunDialog", () => {
  const save = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    save.mockReset().mockResolvedValue(undefined);
    useVaultStore.setState({
      vault: { name: "Work notes", path: "/n", config: {} } as never,
      files: ["a.md", "b.md"],
    });
    useSettingsStore.setState({ settings: settings("builtin", "builtin"), save } as never);
    useEngineStore.setState({
      status: engineStatus({ models: [] }),
      load: vi.fn().mockResolvedValue(undefined),
    } as never);
    useFoundryStore.setState({
      status: null,
      load: vi.fn().mockResolvedValue(undefined),
    } as never);
    useUiStore.setState({ settingsOpen: false });
  });

  it("shows when there is no model, and skipping remembers it", async () => {
    const { unmount } = render(<FirstRunDialog />);
    const user = userEvent.setup();
    expect(await screen.findByText("Welcome to Mimer")).toBeInTheDocument();
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip setup" }));
    expect(screen.queryByText("Welcome to Mimer")).toBeNull();
    unmount();
    render(<FirstRunDialog />);
    expect(screen.queryByText("Welcome to Mimer")).toBeNull();
  });

  it("stays away when a model is already there", () => {
    useEngineStore.setState({ status: engineStatus() } as never);
    render(<FirstRunDialog />);
    expect(screen.queryByText("Welcome to Mimer")).toBeNull();
  });

  it("chooses LM Studio and opens the settings", async () => {
    render(<FirstRunDialog />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /LM Studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    const saved = save.mock.calls[0]?.[0] as Settings;
    expect(saved.ai.defaultProviderId).toBe("lmstudio-default");
    expect(useUiStore.getState().settingsOpen).toBe(true);
  });
});
