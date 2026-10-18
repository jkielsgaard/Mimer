import type { Settings } from "@/bindings/Settings";

const KEY = "mimer.firstRunDone";

/** True once the first-run help was finished or skipped on this computer. */
export function firstRunDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers that the first-run help should not come back. */
export function markFirstRunDone(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage can be blocked; the help then shows again next time */
  }
}

/**
 * True when there is no AI that could answer yet: the chosen AI is the built-in one or Foundry
 * Local and no model has been downloaded for it. Someone who already uses LM Studio, or has a
 * model, never sees the first-run help.
 */
export function needsAiSetup(
  settings: Settings,
  builtinModels: number | null,
  foundryModels: number | null,
): boolean {
  const provider = settings.ai.providers.find((p) => p.id === settings.ai.defaultProviderId);
  if (!provider) return true;
  if (provider.kind === "builtin") return builtinModels === 0;
  if (provider.kind === "foundry_local") return foundryModels === 0;
  return false;
}
