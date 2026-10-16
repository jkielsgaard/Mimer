import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryModel } from "@/bindings/FoundryModel";
import type { FoundryStatus } from "@/bindings/FoundryStatus";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { FoundrySettings } from "./FoundrySettings";
import { useFoundryStore } from "@/stores/foundryStore";

function settings(model = ""): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "lm",
      ravenProviderId: null,
      builtin: { ...DEFAULT_BUILTIN },
      foundry: { model },
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [],
    },
  };
}

function status(over: Partial<FoundryStatus> = {}): FoundryStatus {
  return {
    state: "notInstalled",
    message: "",
    problem: null,
    install: null,
    installed: [],
    activeModel: null,
    available: true,
    unavailableReason: null,
    note: null,
    folder: "/data/mimer-ai/foundry",
    diskBytes: 0,
    restartNeeded: false,
    log: [],
    ...over,
  };
}

const model = (alias: string, sizeMb: number, device = "GPU"): FoundryModel => ({
  alias,
  id: `${alias}-generic-gpu:1`,
  name: alias,
  sizeMb,
  tools: true,
  device,
  license: "apache-2.0",
  cached: false,
});

describe("Settings → Built-in AI → Foundry Local", () => {
  const install = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useFoundryStore.setState({
      status: status(),
      catalog: [model("qwen3-0.6b", 593), model("qwen3-4b", 2763, "NPU")],
      catalogError: null,
      catalogLoading: false,
      load: vi.fn().mockResolvedValue(undefined),
      loadCatalog: vi.fn().mockResolvedValue(undefined),
      install,
      remove,
    });
  });

  it("lists the models with size and where they run, and explains the download", () => {
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: /qwen3-4b/ })).toHaveTextContent("runs on NPU");
    expect(screen.getByRole("radio", { name: /qwen3-0.6b/ })).toHaveTextContent("593 MB");
    const box = screen.getByTestId("foundry-download-explained");
    expect(box).toHaveTextContent("Foundry Local is part of Mimer");
    expect(box).toHaveTextContent("Nothing is downloaded until you press Download");
  });

  it("downloads the chosen model, keeps the open Settings from undoing it, and makes it Mimer's", async () => {
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /qwen3-4b/ }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(install).toHaveBeenCalledWith("qwen3-4b", true);
    const next = onChange.mock.calls[0]?.[0] as Settings;
    expect(next.ai.foundry.model).toBe("qwen3-4b");
    expect(next.ai.defaultProviderId).toBe("foundry");
  });

  it("does not take over Mimer's provider when that box is unticked", async () => {
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(install).toHaveBeenCalledWith("qwen3-0.6b", false);
    expect((onChange.mock.calls[0]?.[0] as Settings).ai.defaultProviderId).toBe("lm");
  });

  it("shows downloaded models, lets one be chosen and removed", async () => {
    useFoundryStore.setState({
      status: status({
        state: "asleep",
        installed: [{ alias: "qwen3-4b", name: "Qwen 3 4B", sizeMb: 2763 }],
      }),
    });
    render(<FoundrySettings draft={settings("qwen3-4b")} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Downloaded" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Qwen 3 4B/ })).toBeChecked();
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove" }));
    expect(remove).toHaveBeenCalledWith({ kind: "model", alias: "qwen3-4b" });
    expect(screen.getByTestId("foundry-folder")).toHaveTextContent("/data/mimer-ai/foundry");
  });

  it("says why Foundry Local cannot be used and blocks the download", () => {
    useFoundryStore.setState({
      status: status({ available: false, unavailableReason: "This build does not include it." }),
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("foundry-unavailable")).toHaveTextContent("does not include it");
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("shows the progress and a Cancel button while downloading", () => {
    useFoundryStore.setState({
      status: status({
        state: "installing",
        message: "Downloading the model… 40%",
        install: { phase: "model", file: "qwen3-4b", done: 40, total: 100 },
      }),
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("foundry-install-progress")).toHaveTextContent("40%");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows a problem with what to do", () => {
    useFoundryStore.setState({
      status: status({
        state: "error",
        problem: {
          title: "The download did not work",
          steps: ["Check the internet connection."],
          details: "",
        },
      }),
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("engine-problem")).toHaveTextContent("The download did not work");
  });
});
