import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRaven } from "./useRaven";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

function withRaven(ravenProviderId: string | null): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "lm",
      ravenProviderId,
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "" },
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
          model: "",
          location: "local",
          supportsTools: true,
          contextTokens: 8000,
        },
        {
          id: "claude",
          kind: "anthropic",
          name: "Claude",
          baseUrl: "https://api.anthropic.com",
          model: "",
          location: "cloud",
          supportsTools: true,
          contextTokens: 8000,
        },
      ],
    },
  };
}

describe("useRaven", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null });
  });

  it("is undefined while Raven is off or settings are not loaded", () => {
    expect(renderHook(() => useRaven()).result.current).toBeUndefined();
    useSettingsStore.setState({ settings: withRaven(null) });
    expect(renderHook(() => useRaven()).result.current).toBeUndefined();
  });

  it("returns the cloud provider chosen for Raven", () => {
    useSettingsStore.setState({ settings: withRaven("claude") });
    expect(renderHook(() => useRaven()).result.current?.name).toBe("Claude");
  });

  it("ignores a local provider and a missing one, so the tab never uses them", () => {
    useSettingsStore.setState({ settings: withRaven("lm") });
    expect(renderHook(() => useRaven()).result.current).toBeUndefined();
    useSettingsStore.setState({ settings: withRaven("gone") });
    expect(renderHook(() => useRaven()).result.current).toBeUndefined();
  });
});
