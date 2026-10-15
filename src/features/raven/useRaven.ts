import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Raven's cloud provider, or `undefined` when Raven is off. Only a provider that really is a
 * cloud one counts (the backend checks this too).
 */
export function useRaven() {
  return useSettingsStore((s) => {
    const id = s.settings?.ai.ravenProviderId;
    if (id === null || id === undefined) return undefined;
    const p = s.settings?.ai.providers.find((x) => x.id === id);
    return p?.location === "cloud" ? p : undefined;
  });
}
