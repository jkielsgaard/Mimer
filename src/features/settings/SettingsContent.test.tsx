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
import { makeSettings } from "@/test/settings";

const stored: Settings = makeSettings({
  ai: {
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
});

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

  it("has one AI tab marked Beta, and the set-up sits in the rows, not in folded sections", async () => {
    await openAiTab();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["General", "AIBeta", "Version history", "Vault"]);
    expect(screen.getByTestId("ai-beta-note")).toHaveTextContent("still being built");
    expect(screen.queryByRole("button", { name: "Built-in AI: set up" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More: LM Studio/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Settings of the chosen AI/ })).toBeNull();
    // The AI in use shows its own setup under its row.
    expect(screen.getByRole("group", { name: /^Set up / })).toBeInTheDocument();
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
    await user.click(screen.getByRole("radio", { name: /LM Studio, or another AI/ }));
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

  it("lists only the other providers: the built-in engines are set up in their own rows", async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <SettingsContent stored={stored} onClose={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /^AI\s*Beta$/ }));
    await user.click(screen.getByRole("radio", { name: /LM Studio, or another AI/ }));
    expect(screen.getByRole("button", { name: /^LM Studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Built-in AI\s*local/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /llama\.cpp/ })).toBeNull();
    expect(screen.getByText(/Choose a provider on the left/)).toBeInTheDocument();
  });
});
