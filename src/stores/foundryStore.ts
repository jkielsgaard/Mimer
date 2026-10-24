import { create } from "zustand";
import type { FoundryModel } from "@/bindings/FoundryModel";
import type { FoundryRemove } from "@/bindings/FoundryRemove";
import type { FoundryStatus } from "@/bindings/FoundryStatus";
import { api, toApiError } from "@/lib/api";
import { reportError } from "@/stores/uiStore";

interface FoundryStoreState {
  status: FoundryStatus | null;
  /** The chat models Foundry Local offers on this computer; null until read. */
  catalog: FoundryModel[] | null;
  catalogError: string | null;
  catalogLoading: boolean;
  /** Reads the status. */
  load: () => Promise<void>;
  /** Reads the model list (the helper asks Microsoft's catalog; this can take a moment). */
  loadCatalog: (refresh?: boolean) => Promise<void>;
  setStatus: (s: FoundryStatus) => void;
  install: (alias: string, useForMimer: boolean) => Promise<void>;
  setupHardware: () => Promise<void>;
  cancelInstall: () => Promise<void>;
  wake: () => Promise<void>;
  sleep: () => Promise<void>;
  remove: (what: FoundryRemove) => Promise<void>;
}

/** Foundry Local, the second built-in AI: its status comes from `foundry://status` events. */
export const useFoundryStore = create<FoundryStoreState>((set, get) => {
  /** Runs a command and shows its error; the new status arrives as an event. */
  const run = async (f: () => Promise<unknown>): Promise<void> => {
    try {
      await f();
    } catch (e) {
      reportError(e);
    }
    try {
      set({ status: await api.foundryStatus() });
    } catch {
      /* keep the last status */
    }
  };
  return {
    status: null,
    catalog: null,
    catalogError: null,
    catalogLoading: false,
    load: async () => {
      try {
        set({ status: await api.foundryStatus() });
      } catch {
        /* Foundry Local is not available */
      }
    },
    loadCatalog: async (refresh = false) => {
      if (get().catalogLoading) return;
      set({ catalogLoading: true, catalogError: null });
      try {
        set({ catalog: await api.foundryCatalog(refresh) });
      } catch (e) {
        set({ catalogError: toApiError(e).message });
      } finally {
        set({ catalogLoading: false });
      }
    },
    setStatus: (status) => {
      set({ status });
    },
    install: (alias, useForMimer) => run(() => api.foundryInstall(alias, useForMimer)),
    setupHardware: () => run(() => api.foundrySetupHardware()),
    cancelInstall: () => run(() => api.foundryCancelInstall()),
    wake: () => run(() => api.foundryWake()),
    sleep: () => run(() => api.foundrySleep()),
    remove: async (what) => {
      await run(() => api.foundryRemove(what));
      set({ catalog: null });
    },
  };
});
