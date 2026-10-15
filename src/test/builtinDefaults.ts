import type { BuiltInSettings } from "@/bindings/BuiltInSettings";

/** The built-in AI settings a freshly installed Mimer has, for test fixtures. */
export const DEFAULT_BUILTIN: BuiltInSettings = {
  cpu: "other",
  gpu: "none",
  backend: "cpu",
  modelId: "gemma-4-12b-qat",
  contextTokens: 16384,
  gpuUse: "auto",
  gpuLayerCount: 32,
  threads: 0,
  flashAttention: "auto",
  thinking: false,
  idleSleepMinutes: 0,
};
