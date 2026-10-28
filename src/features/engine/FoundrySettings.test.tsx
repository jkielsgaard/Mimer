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
      builtin: { ...DEFAULT_BUILTIN },
      foundry: { model, tools: true },
      baseInstruction: "",
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
    activeDevice: null,
    available: true,
    unavailableReason: null,
    note: null,
    folder: "/data/mimer-ai/foundry",
    diskBytes: 0,
    restartNeeded: false,
    log: [],
    hardware: "ready",
    ...over,
  };
}

const model = (alias: string, sizeMb: number, device = "GPU", tools = true): FoundryModel => ({
  alias,
  id: `${alias}-generic-gpu:1`,
  name: alias,
  sizeMb,
  tools,
  device,
  license: "apache-2.0",
  cached: false,
  publisher: "Alibaba",
  task: "chat-completion",
  contextTokens: 32768,
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
    expect(box).toHaveTextContent("already downloaded");
  });

  it("asks first about the hardware parts, and shows no model list before that", async () => {
    const loadCatalog = vi.fn().mockResolvedValue(undefined);
    const setupHardware = vi.fn().mockResolvedValue(undefined);
    const useCpuOnly = vi.fn().mockResolvedValue(undefined);
    useFoundryStore.setState({
      status: status({ hardware: "unknown" }),
      catalog: null,
      loadCatalog,
      setupHardware,
      useCpuOnly,
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    const user = userEvent.setup();
    expect(
      screen.getByRole("heading", { name: /graphics card or neural processor/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Foundry Local models" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    // Nothing is asked of Microsoft yet.
    expect(loadCatalog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use only the processor" }));
    expect(useCpuOnly).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Download and find my hardware" }));
    expect(setupHardware).toHaveBeenCalled();
  });

  it("after choosing only the processor, lists the models and offers Find my hardware", () => {
    useFoundryStore.setState({ status: status({ hardware: "cpuOnly" }) });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Find my hardware" })).toBeInTheDocument();
    expect(screen.getByTestId("foundry-download-explained")).toHaveTextContent(
      "the hardware parts are not downloaded",
    );
  });

  it("shows a failed hardware download in the question", () => {
    useFoundryStore.setState({
      status: status({
        hardware: "unknown",
        state: "error",
        problem: { title: "The download did not work", steps: ["Check the network"], details: "" },
      }),
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByText("The download did not work")).toBeInTheDocument();
  });

  it("shows the progress of the hardware parts in the question", () => {
    useFoundryStore.setState({
      status: status({
        hardware: "unknown",
        state: "installing",
        message: "Setting up the hardware parts… 30%",
        install: { phase: "hardware", file: "", done: 30, total: 100 },
      }),
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("foundry-hardware-progress")).toHaveTextContent("30%");
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
    await user.click(screen.getByRole("checkbox", { name: /Use Foundry Local for Mimer/ }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    // The first model in the recommended order (on the NPU) is chosen until another is.
    expect(install).toHaveBeenCalledWith("qwen3-4b", false);
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
  it("shows every chat model with what it is for, and filters by text, kind and tools", async () => {
    useFoundryStore.setState({
      catalog: [
        model("qwen3-4b", 2763, "NPU"),
        model("deepseek-r1-7b", 4700, "GPU", false),
        model("qwen2.5-coder-7b", 4400),
      ],
    });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    const r1 = screen.getByRole("radio", { name: /deepseek-r1-7b/ });
    expect(r1).toHaveTextContent("No tools");
    expect(r1).toHaveTextContent(/Reasons step by step/);
    expect(screen.getByRole("radio", { name: /qwen3-4b/ })).toHaveTextContent(
      "reads about 25k words",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Code" }));
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      expect.stringContaining("qwen2.5-coder-7b"),
    ]);
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.click(screen.getByRole("checkbox", { name: "Can use tools" }));
    expect(screen.queryByRole("radio", { name: /deepseek/ })).toBeNull();
    await user.type(screen.getByLabelText("Find a model"), "nothing like this");
    expect(screen.getByTestId("foundry-no-match")).toBeInTheDocument();
  });

  it("downloads a model without tools and says so to Mimer", async () => {
    useFoundryStore.setState({ catalog: [model("mistral-7b", 4100, "GPU", false)] });
    render(<FoundrySettings draft={settings()} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Download" }));
    const next = onChange.mock.calls[0]?.[0] as Settings;
    expect(next.ai.foundry).toEqual({ model: "mistral-7b", tools: false });
  });
});
