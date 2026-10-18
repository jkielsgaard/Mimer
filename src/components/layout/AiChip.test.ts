import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import { chipState } from "./AiChip";

const p = (kind: string, name = "Built-in AI"): ProviderConfig =>
  ({ id: "x", kind, name, model: "m" }) as unknown as ProviderConfig;
const base = {
  working: false,
  engineState: undefined as string | undefined,
  engineMessage: "",
  model: "Phi-4-mini",
  device: null as string | null,
};

describe("chipState", () => {
  it("asks to set up when there is no AI", () => {
    expect(chipState({ ...base, provider: undefined })).toMatchObject({ action: "setup" });
  });
  it("is green with the device when the built-in AI is awake", () => {
    const s = chipState({
      ...base,
      provider: p("foundry_local"),
      engineState: "awake",
      device: "NPU",
    });
    expect(s).toEqual({ tone: "ok", label: "Built-in AI · Phi-4-mini · NPU", action: null });
  });
  it("offers Wake when asleep and Fix on a problem", () => {
    expect(chipState({ ...base, provider: p("builtin"), engineState: "asleep" })).toMatchObject({
      tone: "idle",
      action: "wake",
    });
    expect(chipState({ ...base, provider: p("builtin"), engineState: "error" })).toMatchObject({
      tone: "bad",
      action: "fix",
    });
  });
  it("shows progress while waking", () => {
    expect(
      chipState({
        ...base,
        provider: p("builtin"),
        engineState: "waking",
        engineMessage: "Loading the model… 12 s",
      }),
    ).toEqual({ tone: "busy", label: "Loading the model… 12 s", action: null });
  });
  it("working beats everything and offers Stop", () => {
    expect(chipState({ ...base, provider: p("lmstudio"), working: true })).toEqual({
      tone: "busy",
      label: "Mimer is working…",
      action: "stop",
    });
  });
  it("names an external local server without a verb", () => {
    expect(chipState({ ...base, provider: p("lmstudio", "LM Studio") })).toEqual({
      tone: "idle",
      label: "LM Studio · Phi-4-mini",
      action: null,
    });
  });
});
