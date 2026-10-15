import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

vi.mock("@/lib/api", () => ({
  api: {
    hasApiKey: vi.fn().mockResolvedValue(false),
    getDefaultBaseInstruction: vi.fn().mockResolvedValue("default instruction"),
  },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/stores/embeddingStore", () => ({
  useEmbeddingStore: (selector: (s: unknown) => unknown) =>
    selector({ status: null, start: vi.fn(), cancel: vi.fn() }),
}));

import { SettingsContent } from "./SettingsContent";
import { useSettingsStore } from "@/stores/settingsStore";
import { Dialog } from "@/components/ui/dialog";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const stored: Settings = {
  schemaVersion: 1,
  recentVaults: [],
  lastVault: null,
  theme: "system",
  editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
  git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
  ai: {
    defaultProviderId: "lm",
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
        contextTokens: 100000,
      },
      {
        id: "far",
        kind: "lmstudio",
        name: "Far LM Studio",
        baseUrl: "https://models.example.com/v1",
        model: "",
        location: "local",
        supportsTools: true,
        contextTokens: 8000,
      },
    ],
  },
};

describe("Settings → AI: local for notes, cloud for Raven", () => {
  const save = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ settings: stored, save });
  });

  const openAiTab = async (): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <SettingsContent stored={stored} onClose={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "AI" }));
    return user;
  };

  it("lists only local providers for Mimer, also when a LM Studio address is not local", async () => {
    await openAiTab();
    const mimer = screen.getByLabelText("Mimer's provider (local AI)");
    expect(
      within(mimer)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["LM Studio"]);
  });

  it("lists cloud providers for Raven, and Off", async () => {
    await openAiTab();
    const raven = screen.getByLabelText("Raven's provider (cloud AI)");
    expect(
      within(raven)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Off", "Claude", "Far LM Studio"]);
  });

  it("saves the chosen Raven provider", async () => {
    const user = await openAiTab();
    await user.selectOptions(screen.getByLabelText("Raven's provider (cloud AI)"), "claude");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saved = save.mock.calls[0]?.[0] as Settings | undefined;
    expect(saved?.ai.ravenProviderId).toBe("claude");
    expect(saved?.ai.defaultProviderId).toBe("lm");
  });
});
