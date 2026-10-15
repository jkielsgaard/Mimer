import type { Catalog } from "@/bindings/Catalog";
import type { EngineStatus } from "@/bindings/EngineStatus";
import type { HardwareInfo } from "@/bindings/HardwareInfo";

/** An engine status for tests; `patch` overrides what the test cares about. */
export function engineStatus(patch: Partial<EngineStatus> = {}): EngineStatus {
  return {
    state: "asleep",
    message: "",
    problem: null,
    install: null,
    engine: { build: "b11636", backend: "vulkan" },
    models: [
      {
        id: "gemma-4-12b-qat",
        name: "Gemma 4 12B (recommended)",
        file: "gemma-4-12b-it-qat-q4_0.gguf",
        sizeBytes: 6_975_879_296,
        custom: false,
      },
    ],
    selectedModelReady: true,
    activeModel: null,
    folder: "/data/mimer-ai",
    folderNote: null,
    log: [],
    restartNeeded: false,
    diskBytes: 7_000_000_000,
    ...patch,
  };
}

export const CATALOG: Catalog = {
  unavailableReason: null,
  engineBuild: "b11636",
  os: "linux",
  backends: [
    {
      id: "cpu",
      label: "CPU only",
      description: "Runs on the processor.",
      defaultFor: ["none"],
      advanced: false,
      downloadBytes: 17_823_415,
    },
    {
      id: "vulkan",
      label: "Graphics card (Vulkan)",
      description: "Works with AMD, Intel and Nvidia graphics cards.",
      defaultFor: ["amd", "intel"],
      advanced: false,
      downloadBytes: 30_450_220,
    },
    {
      id: "cuda12",
      label: "Nvidia (CUDA 12)",
      description: "The fastest choice for Nvidia cards.",
      defaultFor: ["nvidia"],
      advanced: false,
      downloadBytes: 766_875_835,
    },
    {
      id: "rocm",
      label: "AMD (ROCm)",
      description: "For supported AMD cards.",
      defaultFor: [],
      advanced: true,
      downloadBytes: 245_031_740,
    },
  ],
  models: [
    {
      id: "gemma-4-12b-qat",
      name: "Gemma 4 12B (recommended)",
      description: "A good balance.",
      sizeBytes: 6_975_879_296,
      ramGb: 12,
      recommended: true,
    },
    {
      id: "gemma-4-e2b-qat",
      name: "Gemma 4 E2B (very light)",
      description: "For little memory.",
      sizeBytes: 3_349_516_256,
      ramGb: 6,
      recommended: false,
    },
  ],
};

export const HARDWARE: HardwareInfo = {
  os: "linux",
  cpuVendor: "amd",
  cpuName: "AMD Ryzen AI 7 PRO 350",
  cpuThreads: 16,
  gpus: [{ vendor: "amd", name: "AMD graphics card" }],
  ramGb: 31,
  recommendedGpu: "amd",
};
