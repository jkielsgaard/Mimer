import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";
import { engineStatus } from "@/test/engineFixtures";

const api = vi.hoisted(() => ({
  listChats: vi.fn().mockResolvedValue([]),
  listPrompts: vi.fn().mockResolvedValue([]),
  saveChat: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { ChatPanel } from "./ChatPanel";
import { useEngineStore } from "@/stores/engineStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";

function settings(defaultProviderId: string): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId,
      ravenProviderId: null,
      builtin: DEFAULT_BUILTIN,
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [
        {
          id: "lm",
          kind: "lmstudio",
          name: "LM Studio",
          baseUrl: "http://localhost:1234/v1",
          model: "m",
          location: "local",
          supportsTools: true,
          contextTokens: 8000,
        },
        {
          id: "builtin",
          kind: "builtin",
          name: "Mimer (built-in)",
          baseUrl: "http://127.0.0.1:8080/v1",
          model: "mimer",
          location: "local",
          supportsTools: true,
          contextTokens: 16384,
        },
      ],
    },
  };
}

describe("the Mimer tab with the built-in AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue([]);
    api.listPrompts.mockResolvedValue([]);
    useVaultStore.setState({
      vault: null,
      files: [],
      tree: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
  });

  it("the message box and Send are locked until Mimer is awake, and say why", () => {
    useSettingsStore.setState({ settings: settings("builtin") });
    useEngineStore.setState({ status: engineStatus({ state: "asleep" }) });
    render(<ChatPanel />);
    const box = screen.getByLabelText("Message Mimer");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("placeholder", "Wake Mimer to start chatting");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Wake Mimer/ })).toBeInTheDocument();
  });

  it("stays locked while the model is loading", () => {
    useSettingsStore.setState({ settings: settings("builtin") });
    useEngineStore.setState({ status: engineStatus({ state: "waking", message: "Loading…" }) });
    render(<ChatPanel />);
    expect(screen.getByLabelText("Message Mimer")).toBeDisabled();
  });

  it("is open for writing when Mimer is awake", () => {
    useSettingsStore.setState({ settings: settings("builtin") });
    useEngineStore.setState({ status: engineStatus({ state: "awake" }) });
    render(<ChatPanel />);
    expect(screen.getByLabelText("Message Mimer")).toBeEnabled();
    expect(screen.getByRole("button", { name: /Sleep Mimer/ })).toBeInTheDocument();
  });

  it("another provider is not affected and shows no Wake bar", () => {
    useSettingsStore.setState({ settings: settings("lm") });
    useEngineStore.setState({ status: engineStatus({ state: "asleep" }) });
    render(<ChatPanel />);
    expect(screen.getByLabelText("Message Mimer")).toBeEnabled();
    expect(screen.queryByTestId("engine-bar")).toBeNull();
  });
});
