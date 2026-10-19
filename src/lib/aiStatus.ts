import type { ProviderConfig } from "@/bindings/ProviderConfig";

/**
 * Why the AI buttons cannot be used right now, or null when a local AI is set up and running.
 * It only looks at what is known without asking the AI (an AI on another program, such as LM
 * Studio, may still turn out to be closed; that is said when a button is pressed). Everything
 * that is not AI keeps working either way.
 */
export function aiBlocked(
  provider: ProviderConfig | undefined,
  engineState: string | undefined,
  foundryState: string | undefined,
): string | null {
  if (!provider) return "No AI is set up. Choose one in Settings → AI.";
  if (provider.location !== "local") {
    return "Your notes only go to a local AI, and the chosen AI is not local. Choose a local one in Settings → AI.";
  }
  // An asleep built-in AI is woken when something is asked of it (see `wakeIfNeeded`).
  const ready = (state: string | undefined): boolean =>
    state === "awake" || state === "asleep" || state === "waking" || state === "installing";
  if (provider.kind === "builtin" && !ready(engineState)) {
    return "The built-in AI is not set up or has a problem. Open Settings → Built-in AI.";
  }
  if (provider.kind === "foundry_local" && !ready(foundryState)) {
    return "Foundry Local is not set up or has a problem. Open Settings → Built-in AI.";
  }
  return null;
}
