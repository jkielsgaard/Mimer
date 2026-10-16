import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const api = vi.hoisted(() => ({
  listModels: vi.fn(),
  engineStatus: vi.fn(),
  engineCatalog: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { AiSwitcher } from "./AiSwitcher";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useEngineStore } from "@/stores/engineStore";

function settings(): Settings {
  const p = (id: string, name: string, kind: Settings["ai"]["providers"][number]["kind"]) => ({
    id,
    kind,
    name,
    baseUrl: kind === "anthropic" ? "https://api.anthropic.com" : "http://localhost:1234/v1",
    model: "model-a",
    location: kind === "anthropic" ? ("cloud" as const) : ("local" as const),
    supportsTools: true,
    contextTokens: 8000,
  });
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "lm",
      ravenProviderId: "claude",
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "" },
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [
        p("lm", "LM Studio", "lmstudio"),
        p("foundry", "Foundry Local", "foundry_local"),
        p("claude", "Claude", "anthropic"),
      ],
    },
  };
}

describe("AiSwitcher", () => {
  const save = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    api.listModels.mockResolvedValue(["model-a", "model-b"]);
    const s0 = settings();
    s0.ai.foundry = { model: "qwen3-4b" };
    useSettingsStore.setState({ settings: s0, save });
    useVaultStore.setState({
      vault: null,
      files: [],
      tree: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
  });

  it("shows the AI and model, and Mimer lists only local providers", async () => {
    render(<AiSwitcher role="mimer" />);
    const trigger = screen.getByRole("button", { name: /Change AI: LM Studio · model-a/ });
    await userEvent.setup().click(trigger);
    expect(await screen.findByRole("menuitem", { name: /^LM Studio/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Foundry Local" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Claude/ })).toBeNull();
  });

  it("Raven lists only cloud providers", async () => {
    render(<AiSwitcher role="raven" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Change AI: Claude/ }));
    expect(await screen.findByRole("menuitem", { name: /^Claude/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^LM Studio/ })).toBeNull();
  });

  it("choosing another provider saves it as Mimer's provider", async () => {
    render(<AiSwitcher role="mimer" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Change AI/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Foundry Local" }));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    const saved = save.mock.calls[0]?.[0] as Settings;
    expect(saved.ai.defaultProviderId).toBe("foundry");
    expect(saved.ai.ravenProviderId).toBe("claude");
  });

  it("choosing a model saves it on that provider only", async () => {
    render(<AiSwitcher role="mimer" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Change AI/ }));
    await user.click(await screen.findByRole("menuitem", { name: "model-b" }));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    const saved = save.mock.calls[0]?.[0] as Settings;
    expect(saved.ai.providers.find((x) => x.id === "lm")?.model).toBe("model-b");
    expect(saved.ai.providers.find((x) => x.id === "claude")?.model).toBe("model-a");
  });

  it("says so when the models cannot be listed", async () => {
    api.listModels.mockRejectedValue(new Error("connection refused"));
    render(<AiSwitcher role="mimer" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Change AI/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("connection refused");
  });

  it("cannot be opened while an answer is being written", () => {
    render(<AiSwitcher role="mimer" disabled />);
    expect(screen.getByRole("button", { name: /Change AI/ })).toBeDisabled();
  });

  it("the built-in AI lists the downloaded models", async () => {
    const s = settings();
    s.ai.defaultProviderId = "builtin";
    s.ai.providers.push({
      id: "builtin",
      kind: "builtin",
      name: "Mimer (built-in)",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "mimer",
      location: "local",
      supportsTools: true,
      contextTokens: 16384,
    });
    useSettingsStore.setState({ settings: s });
    useEngineStore.setState({
      load: vi.fn().mockResolvedValue(undefined),
      status: {
        models: [
          { id: "gemma-12b", name: "Gemma 4 12B", file: "a", sizeBytes: 1, custom: false },
          { id: "gemma-e2b", name: "Gemma 4 E2B", file: "b", sizeBytes: 1, custom: false },
        ],
      } as never,
    });
    render(<AiSwitcher role="mimer" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Change AI/ }));
    expect(await screen.findByRole("menuitem", { name: "Gemma 4 E2B" })).toBeInTheDocument();
    expect(screen.getByText(/next time Mimer is woken/)).toBeInTheDocument();
    expect(api.listModels).not.toHaveBeenCalled();
  });
});
