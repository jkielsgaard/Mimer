import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";
import { engineStatus } from "@/test/engineFixtures";

const api = vi.hoisted(() => ({
  listChats: vi.fn().mockResolvedValue([]),
  engineWake: vi.fn(),
  saveChat: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { ChatPanel } from "./ChatPanel";
import { useChatStore } from "@/stores/chatStore";
import { useEngineStore } from "@/stores/engineStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";

function settings(defaultProviderId: string): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
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
      defaultProviderId,
      checkAnswers: false,
      cloudConsent: null,
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "", tools: true },
      baseInstruction: "",
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

describe("the chat with the built-in AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue([]);
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.aiChat.mockResolvedValue("task-1");
    useChatStore.getState().resetForVault();
    useVaultStore.setState({
      vault: null,
      files: [],
      tree: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
  });

  it("has no Wake button and no model switch: the message box is always open", () => {
    useSettingsStore.setState({ settings: settings("builtin") });
    useEngineStore.setState({ status: engineStatus({ state: "asleep" }) });
    render(<ChatPanel />);
    expect(screen.getByLabelText("Message Mimer")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Wake Mimer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change AI/ })).toBeNull();
  });

  it("wakes a sleeping built-in AI when a message is sent, then sends it", async () => {
    useSettingsStore.setState({ settings: settings("builtin") });
    useEngineStore.setState({ status: engineStatus({ state: "asleep" }) });
    api.engineWake.mockImplementation(() => {
      useEngineStore.setState({ status: engineStatus({ state: "awake" }) });
      return Promise.resolve(undefined);
    });
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message Mimer"), "Hello{Enter}");
    await waitFor(() => {
      expect(api.aiChat).toHaveBeenCalled();
    });
    expect(api.engineWake).toHaveBeenCalledTimes(1);
  });

  it("does not wake anything for another provider", async () => {
    useSettingsStore.setState({ settings: settings("lm") });
    useEngineStore.setState({ status: engineStatus({ state: "asleep" }) });
    render(<ChatPanel />);
    await userEvent.setup().type(screen.getByLabelText("Message Mimer"), "Hello{Enter}");
    await waitFor(() => {
      expect(api.aiChat).toHaveBeenCalled();
    });
    expect(api.engineWake).not.toHaveBeenCalled();
  });
});
