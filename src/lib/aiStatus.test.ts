import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import { aiBlocked } from "./aiStatus";

const provider = (kind: string, location = "local"): ProviderConfig =>
  ({ id: "p", kind, name: "AI", location }) as unknown as ProviderConfig;

describe("whether the AI buttons can be used", () => {
  it("says why when there is no local AI running", () => {
    expect(aiBlocked(undefined, undefined, undefined)).toMatch(/No AI is set up/);
    expect(aiBlocked(provider("anthropic", "cloud"), undefined, undefined)).toMatch(/not local/);
    expect(aiBlocked(provider("builtin"), undefined, undefined)).toMatch(/not set up/);
    expect(aiBlocked(provider("builtin"), "error", undefined)).toMatch(/problem/);
    expect(aiBlocked(provider("foundry_local"), undefined, undefined)).toMatch(/Foundry Local/);
  });

  it("lets them be used when a built-in AI is asleep: it is woken when something is asked", () => {
    expect(aiBlocked(provider("builtin"), "asleep", undefined)).toBeNull();
    expect(aiBlocked(provider("foundry_local"), undefined, "waking")).toBeNull();
  });

  it("lets them be used when a local AI is ready", () => {
    expect(aiBlocked(provider("builtin"), "awake", undefined)).toBeNull();
    expect(aiBlocked(provider("lmstudio"), undefined, undefined)).toBeNull();
  });
});
