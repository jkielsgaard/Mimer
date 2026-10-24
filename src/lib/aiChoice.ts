import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { effectiveLocation } from "@/lib/providers";

/** The kinds of AI on the AI tab, one line each. */
export type AiOption = "phi" | "foundry" | "llama" | "local" | "cloud";

export interface Where {
  os: string;
  /** The Microsoft Store package. */
  store: boolean;
  /** Phi Silica is offered (the Store package on Windows). */
  phiShown: boolean;
  /** This PC can run Phi Silica (a Copilot+ PC). */
  copilot: boolean;
}

/**
 * The AI choices in the order that suits where Mimer runs. Cloud AI is always last. Phi Silica
 * only on a Copilot+ PC with the Store version; llama.cpp is not in the Store version; Foundry
 * Local is in every Windows version, and on Linux it comes after LM Studio (experimental).
 */
export function aiOrder(w: Where): AiOption[] {
  if (w.store) {
    return w.phiShown && w.copilot
      ? ["phi", "foundry", "local", "cloud"]
      : ["foundry", "local", "cloud"];
  }
  if (w.os === "windows") return ["llama", "foundry", "local", "cloud"];
  return ["llama", "local", "foundry", "cloud"];
}

/** True when `p` is the cloud AI the user agreed to, at the address they agreed to. */
export function cloudConsented(settings: Settings, p: ProviderConfig): boolean {
  const c = settings.ai.cloudConsent;
  return (
    p.kind === "openai_compatible" &&
    effectiveLocation(p) === "cloud" &&
    c !== null &&
    c.providerId === p.id &&
    c.baseUrl === p.baseUrl
  );
}

/** The cloud AIs that can be turned on (OpenAI-compatible at a cloud address). */
export function cloudProviders(settings: Settings): ProviderConfig[] {
  return settings.ai.providers.filter(
    (p) => p.kind === "openai_compatible" && effectiveLocation(p) === "cloud",
  );
}

/** LM Studio and other servers on this computer (not the built-in engines). */
export function otherLocalProviders(settings: Settings): ProviderConfig[] {
  return settings.ai.providers.filter(
    (p) =>
      (p.kind === "lmstudio" || p.kind === "openai_compatible") && effectiveLocation(p) === "local",
  );
}

/** Which line of the list a provider belongs to. */
export function optionOf(p: ProviderConfig | undefined): AiOption | null {
  if (!p) return null;
  if (p.kind === "phi_silica") return "phi";
  if (p.kind === "foundry_local") return "foundry";
  if (p.kind === "builtin") return "llama";
  if (p.kind === "anthropic") return null;
  return effectiveLocation(p) === "cloud" ? "cloud" : "local";
}
