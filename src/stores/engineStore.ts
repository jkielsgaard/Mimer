import { create } from "zustand";
import type { Catalog } from "@/bindings/Catalog";
import type { EngineStatus } from "@/bindings/EngineStatus";
import type { HardwareInfo } from "@/bindings/HardwareInfo";
import type { InstallRequest } from "@/bindings/InstallRequest";
import type { RemoveWhat } from "@/bindings/RemoveWhat";
import { api } from "@/lib/api";
import { reportError } from "@/stores/uiStore";

interface EngineStoreState {
  status: EngineStatus | null;
  catalog: Catalog | null;
  hardware: HardwareInfo | null;
  /** Reads the status (and the catalog the first time). */
  load: () => Promise<void>;
  /** Reads what this computer has, for the pre-selected choices. */
  loadHardware: () => Promise<void>;
  setStatus: (s: EngineStatus) => void;
  install: (request: InstallRequest) => Promise<void>;
  cancelInstall: () => Promise<void>;
  addModel: (path: string) => Promise<void>;
  wake: () => Promise<void>;
  sleep: () => Promise<void>;
  remove: (what: RemoveWhat) => Promise<void>;
}

/** The built-in AI: its status comes from `engine://status` events. */
export const useEngineStore = create<EngineStoreState>((set, get) => {
  /** Runs a command and shows its error; the new status arrives as an event. */
  const run = async (f: () => Promise<unknown>): Promise<void> => {
    try {
      await f();
    } catch (e) {
      reportError(e);
    }
    // The event normally does this, but a command that failed early sends none.
    try {
      set({ status: await api.engineStatus() });
    } catch {
      /* keep the last status */
    }
  };
  return {
    status: null,
    catalog: null,
    hardware: null,
    load: async () => {
      try {
        const [status, catalog] = await Promise.all([
          api.engineStatus(),
          get().catalog ? Promise.resolve(get().catalog) : api.engineCatalog(),
        ]);
        set({ status, catalog });
      } catch {
        /* the built-in AI is not available (for example on an unsupported system) */
      }
    },
    loadHardware: async () => {
      if (get().hardware) return;
      try {
        set({ hardware: await api.engineHardware() });
      } catch {
        /* detection is only a convenience */
      }
    },
    setStatus: (status) => {
      set({ status });
    },
    install: (request) => run(() => api.engineInstall(request)),
    cancelInstall: () => run(() => api.engineCancelInstall()),
    addModel: (path) => run(() => api.engineAddModel(path)),
    wake: () => run(() => api.engineWake()),
    sleep: () => run(() => api.engineSleep()),
    remove: (what) => run(() => api.engineRemove(what)),
  };
});
