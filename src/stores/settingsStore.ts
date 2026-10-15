import { create } from "zustand";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { api, toApiError } from "@/lib/api";

interface SettingsState {
  settings: Settings | null;
  /** Set when settings.json could not be loaded (e.g. unknown schema version). */
  error: string | null;
  load: () => Promise<void>;
  save: (next: Settings) => Promise<void>;
  /** Removes a vault from the recent list (the folder on disk is not touched). */
  forgetVault: (path: string) => Promise<void>;
  provider: (id: string | null | undefined) => ProviderConfig | undefined;
  defaultProvider: () => ProviderConfig | undefined;
}

/** Applies theme and editor CSS variables to the document. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const dark =
    s.theme === "dark" ||
    (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.setProperty("--editor-font-size", `${s.editor.fontSize}px`);
  root.style.setProperty("--editor-line-width", `${s.editor.lineWidth}px`);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  error: null,
  load: async () => {
    try {
      const settings = await api.getSettings();
      applySettings(settings);
      set({ settings, error: null });
    } catch (e) {
      set({ error: toApiError(e).message });
    }
  },
  save: async (next) => {
    await api.updateSettings(next);
    const settings = await api.getSettings();
    applySettings(settings);
    set({ settings });
  },
  forgetVault: async (path) => {
    await api.forgetVault(path);
    const settings = await api.getSettings();
    set({ settings });
  },
  provider: (id) => {
    const s = get().settings;
    if (!s || !id) return undefined;
    return s.ai.providers.find((p) => p.id === id);
  },
  defaultProvider: () => {
    const s = get().settings;
    return s?.ai.providers.find((p) => p.id === s.ai.defaultProviderId);
  },
}));
