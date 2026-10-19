import { activeAi } from "@/features/chat/useActiveAi";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";

/** How long to wait for a built-in AI to load its model (milliseconds). */
const WAIT_MS = 3 * 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Makes sure the built-in AI (llama.cpp or Foundry Local) is awake before something is asked of
 * it: an asleep AI is woken and waited for, so nobody has to press Wake first. Resolves to null
 * when the AI is ready (or is not a built-in one), or to a message that says what is wrong.
 */
export async function wakeIfNeeded(): Promise<string | null> {
  const { provider } = activeAi(useSettingsStore.getState().settings, useVaultStore.getState());
  if (provider?.kind !== "builtin" && provider?.kind !== "foundry_local") return null;
  const foundry = provider.kind === "foundry_local";
  const state = (): string | undefined =>
    foundry ? useFoundryStore.getState().status?.state : useEngineStore.getState().status?.state;
  const message = (): string =>
    state() === "error"
      ? `${provider.name} has a problem. Open Settings → Built-in AI.`
      : `${provider.name} is not set up. Open Settings → Built-in AI.`;
  if (state() === "awake") return null;
  if (state() === "asleep") {
    if (foundry) await useFoundryStore.getState().wake();
    else await useEngineStore.getState().wake();
  }
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    const s = state();
    if (s === "awake") return null;
    if (s !== "asleep" && s !== "waking" && s !== "installing") return message();
    await sleep(250);
  }
  return `${provider.name} did not wake up in time. Try again.`;
}
