import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";
import { CATALOG, engineStatus, HARDWARE } from "@/test/engineFixtures";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => ({ pickModelFile: vi.fn() }));

import { BuiltInAiSettings } from "./BuiltInAiSettings";
import { useEngineStore } from "@/stores/engineStore";

function settings(): Settings {
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
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [],
    },
  };
}

describe("Settings → Built-in AI", () => {
  const install = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const load = vi.fn().mockResolvedValue(undefined);
  const loadHardware = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useEngineStore.setState({
      status: engineStatus({
        state: "notInstalled",
        engine: null,
        models: [],
        selectedModelReady: false,
      }),
      catalog: CATALOG,
      hardware: HARDWARE,
      install,
      remove,
      load,
      loadHardware,
    });
  });

  it("pre-selects what was found: AMD processor, AMD graphics card, the Vulkan engine", async () => {
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("hardware-found")).toHaveTextContent("AMD Ryzen AI 7 PRO 350");
    expect(screen.getByTestId("hardware-found")).toHaveTextContent("31 GB memory");
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const next = onChange.mock.calls[0]?.[0] as Settings;
    expect(next.ai.builtin).toMatchObject({ cpu: "amd", gpu: "amd", backend: "vulkan" });
  });

  it("choosing a graphics card picks its default engine", async () => {
    useEngineStore.setState({ hardware: null });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Graphics card (GPU)"), "nvidia");
    const next = onChange.mock.calls.at(-1)?.[0] as Settings;
    expect(next.ai.builtin).toMatchObject({ gpu: "nvidia", backend: "cuda12" });
  });

  it("lists advanced engines separately and shows the download sizes", () => {
    useEngineStore.setState({ hardware: null });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    const select = screen.getByLabelText("Engine to download");
    const advanced = select.querySelector("optgroup[label='Advanced']");
    expect(advanced).not.toBeNull();
    expect(within(advanced as HTMLElement).getByText(/AMD \(ROCm\)/)).toBeInTheDocument();
    expect(within(select).getByText(/Graphics card \(Vulkan\) · 30\.5 MB/)).toBeInTheDocument();
  });

  it("Download sends the choices, and says how much will be downloaded", async () => {
    useEngineStore.setState({ hardware: null });
    const draft = settings();
    draft.ai.builtin = { ...draft.ai.builtin, cpu: "amd", gpu: "amd", backend: "vulkan" };
    render(<BuiltInAiSettings draft={draft} onChange={onChange} />);
    expect(screen.getByText(/7\.0 GB will be downloaded/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Download" }));
    expect(install).toHaveBeenCalledWith({
      cpu: "amd",
      gpu: "amd",
      backend: "vulkan",
      modelId: "gemma-4-12b-qat",
      useForMimer: true,
    });
  });

  it("warns when the model needs more memory than the computer has", () => {
    useEngineStore.setState({ hardware: { ...HARDWARE, ramGb: 8 } });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    expect(screen.getByRole("note")).toHaveTextContent(/about 8 GB of memory.*needs about 12 GB/);
  });

  it("shows progress and a Cancel button while downloading", () => {
    useEngineStore.setState({
      status: engineStatus({
        state: "installing",
        message: "Downloading Gemma 4 12B…",
        install: { phase: "model", file: "m.gguf", done: 3_487_939_648, total: 6_975_879_296 },
      }),
    });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    const box = screen.getByTestId("install-progress");
    expect(box).toHaveTextContent("50%");
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });

  it("a failed download shows what went wrong and what to do", () => {
    useEngineStore.setState({
      status: engineStatus({
        state: "error",
        engine: null,
        models: [],
        problem: {
          title: "The download did not finish",
          steps: ["Check the internet connection.", "Press Download again."],
          details: "The download from huggingface.co failed",
        },
      }),
    });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    const box = screen.getByTestId("engine-problem");
    expect(box).toHaveTextContent("The download did not finish");
    expect(box).toHaveTextContent("Check the internet connection.");
  });

  it("shows where the files are, can remove a model, and asks before removing everything", async () => {
    useEngineStore.setState({ status: engineStatus() });
    const draft = settings();
    draft.ai.builtin = { ...draft.ai.builtin, backend: "vulkan" };
    render(<BuiltInAiSettings draft={draft} onChange={onChange} />);
    expect(screen.getByTestId("engine-folder")).toHaveTextContent("/data/mimer-ai · 7.0 GB used");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Remove Gemma 4 12B/ }));
    expect(remove).toHaveBeenCalledWith({ kind: "model", id: "gemma-4-12b-qat" });
    await user.click(screen.getByRole("button", { name: "Remove all files" }));
    expect(remove).toHaveBeenCalledTimes(1);
    await user.click(
      await screen.findByRole("button", { name: "Remove all files", hidden: false }),
    );
  });

  it("the tuning settings change the draft, and are kept in range", async () => {
    useEngineStore.setState({ hardware: null, status: engineStatus() });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Flash attention"), "off");
    expect((onChange.mock.calls.at(-1)?.[0] as Settings).ai.builtin.flashAttention).toBe("off");
    await user.selectOptions(screen.getByLabelText("Use the graphics card"), "none");
    expect((onChange.mock.calls.at(-1)?.[0] as Settings).ai.builtin.gpuUse).toBe("none");
    await user.click(screen.getByLabelText(/Let the model think/));
    expect((onChange.mock.calls.at(-1)?.[0] as Settings).ai.builtin.thinking).toBe(true);
  });

  it("in the Microsoft Store version it only says that the built-in AI is not available", () => {
    useEngineStore.setState({
      catalog: {
        ...CATALOG,
        unavailableReason: "The Microsoft Store version of Mimer does not download an engine.",
      },
    });
    render(<BuiltInAiSettings draft={settings()} onChange={onChange} />);
    expect(screen.getByTestId("engine-unavailable")).toHaveTextContent("Microsoft Store version");
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });
});
