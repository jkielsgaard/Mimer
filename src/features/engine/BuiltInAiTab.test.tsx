import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";
import { CATALOG, engineStatus, HARDWARE } from "@/test/engineFixtures";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => ({ pickModelFile: vi.fn() }));

import { BuiltInAiTab } from "./BuiltInAiTab";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";

function settings(defaultProviderId = "lm", foundryModel = ""): Settings {
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
      builtin: { ...DEFAULT_BUILTIN },
      foundry: { model: foundryModel },
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [],
    },
  };
}

describe("Settings → Built-in AI: the engine choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEngineStore.setState({
      status: engineStatus({ state: "notInstalled", engine: null, models: [] }),
      catalog: CATALOG,
      hardware: HARDWARE,
      load: vi.fn().mockResolvedValue(undefined),
      loadHardware: vi.fn().mockResolvedValue(undefined),
    });
    useFoundryStore.setState({
      status: {
        state: "notInstalled",
        message: "",
        problem: null,
        install: null,
        installed: [],
        activeModel: null,
        available: true,
        unavailableReason: null,
        note: null,
        folder: "/f",
        diskBytes: 0,
        restartNeeded: false,
        log: [],
      },
      catalog: [],
      load: vi.fn().mockResolvedValue(undefined),
      loadCatalog: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("has no engine chosen for a new user, and asks them to choose", () => {
    render(<BuiltInAiTab draft={settings()} onChange={vi.fn()} />);
    expect(screen.getByTestId("engine-choose")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Foundry Local/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: /llama\.cpp/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows the settings of the engine that is chosen", async () => {
    render(<BuiltInAiTab draft={settings()} onChange={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Foundry Local/ }));
    expect(screen.getByTestId("foundry-download-explained")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-choose")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /llama\.cpp/ }));
    expect(screen.getByLabelText("Engine to download")).toBeInTheDocument();
  });

  it("starts on the engine that is already in use", () => {
    render(<BuiltInAiTab draft={settings("foundry", "qwen3-4b")} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Foundry Local/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("foundry-download-explained")).toBeInTheDocument();
  });
});
