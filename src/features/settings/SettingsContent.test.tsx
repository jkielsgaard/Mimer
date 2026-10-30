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
    defaultProviderId: "lm",
    checkAnswers: false,
    cloudConsent: null,
    builtin: DEFAULT_BUILTIN,
    foundry: { model: "", tools: true },
    answerLanguage: "",
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

describe("Settings → AI: which AI Mimer uses", () => {
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
    await user.click(screen.getByRole("button", { name: /^AI\s*Beta$/ }));
    return user;
  };

  it("shows one list of AIs for Mimer, with cloud AI last and off", async () => {
    await openAiTab();
    const list = screen.getByRole("radiogroup", { name: "AI for Mimer" });
    const lines = within(list).getAllByRole("radio");
    expect(lines.at(-1)).toHaveTextContent(/Cloud AI.*Notes leave this computer.*Off/);
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it("has one AI tab marked Beta, with the set-up folded in sections", async () => {
    const user = await openAiTab();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["General", "AIBeta", "Version history", "Vault"]);
    expect(screen.getByTestId("ai-beta-note")).toHaveTextContent("still being built");
    const built = screen.getByRole("button", { name: "Built-in AI: set up" });
    expect(built).toHaveAttribute("aria-expanded", "false");
    await user.click(built);
    expect(built).toHaveAttribute("aria-expanded", "true");
  });

  it("has About me and my notes and a language for the AI's answers, and no base instruction", async () => {
    await openAiTab();
    expect(screen.getByLabelText("About me and my notes")).toBeInTheDocument();
    const language = screen.getByLabelText("Language of the AI's answers");
    expect(language).toHaveValue("");
    expect([...language.querySelectorAll("option")].map((o) => o.textContent)).toContain("Danish");
    expect(screen.queryByText(/Mimer's instruction/)).toBeNull();
    expect(screen.queryByText("Global instructions")).toBeNull();
  });

  it("has no Raven setting and no own-knowledge setting any more", async () => {
    await openAiTab();
    expect(screen.queryByLabelText("Raven's provider (cloud AI)")).toBeNull();
    expect(screen.queryByText(/write new content from its own knowledge/)).toBeNull();
  });
});

describe("Settings → AI providers", () => {
  const save = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ settings: stored, save });
  });

  const openProviders = async (): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <SettingsContent stored={stored} onClose={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /^AI\s*Beta$/ }));
    await user.click(screen.getByRole("button", { name: "More: LM Studio and other providers" }));
    return user;
  };

  it("opens with no provider chosen and says what to do", async () => {
    await openProviders();
    expect(screen.getByText(/Choose a provider on the left/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Base URL")).toBeNull();
    expect(screen.getAllByRole("button", { name: /LM Studio/ }).length).toBeGreaterThan(0);
  });

  it("Add provider offers only local kinds and adds the one chosen", async () => {
    const user = await openProviders();
    await user.click(screen.getByRole("button", { name: /Add provider/ }));
    const note = await screen.findByTestId("add-provider-note");
    expect(note).toHaveTextContent("never leave it");
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    expect(screen.getByRole("radio", { name: /LM Studio/ })).toHaveTextContent("Local");
    expect(screen.queryByRole("radio", { name: /Anthropic/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Another server on this computer/ }));
    expect(add).toBeEnabled();
    await user.click(add);
    expect(screen.getByLabelText("Kind")).toHaveValue("openai_compatible");
    expect(screen.getByLabelText("Base URL")).toHaveValue("http://localhost:11434/v1");
  });

  it("Cancel in the Add window adds nothing", async () => {
    const user = await openProviders();
    await user.click(screen.getByRole("button", { name: /Add provider/ }));
    await user.click(await screen.findByRole("radio", { name: /LM Studio/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("add-provider-note")).toBeNull();
    expect(screen.getByText(/Choose a provider on the left/)).toBeInTheDocument();
  });

  it("lists the built-in AI as one entry, whichever engine it uses, next to the other providers", async () => {
    const withBuiltIns: Settings = {
      ...stored,
      ai: {
        ...stored.ai,
        providers: [
          ...stored.ai.providers,
          {
            id: "builtin",
            kind: "builtin",
            name: "Built-in AI · llama.cpp",
            baseUrl: "http://127.0.0.1:8080/v1",
            model: "mimer",
            location: "local",
            supportsTools: true,
            contextTokens: 16384,
          },
          {
            id: "foundry",
            kind: "foundry_local",
            name: "Built-in AI · Foundry Local",
            baseUrl: "http://127.0.0.1:5272/v1",
            model: "",
            location: "local",
            supportsTools: true,
            contextTokens: 16000,
          },
        ],
      },
    };
    useSettingsStore.setState({ settings: withBuiltIns, save });
    const user = userEvent.setup();
    render(
      <Dialog open>
        <SettingsContent stored={withBuiltIns} onClose={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /^AI\s*Beta$/ }));
    await user.click(screen.getByRole("button", { name: "More: LM Studio and other providers" }));
    expect(screen.getAllByRole("button", { name: /^Built-in AI\s*local/ })).toHaveLength(1);
    // The other providers are still listed, and the two engines are not listed separately.
    expect(screen.getByRole("button", { name: /^LM Studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /llama\.cpp/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Built-in AI\s*local/ }));
    expect(screen.getByRole("button", { name: "Open Built-in AI" })).toBeInTheDocument();
    expect(screen.queryByText(/Choose a provider on the left/)).toBeNull();
  });
});
