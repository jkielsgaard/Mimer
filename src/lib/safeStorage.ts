// localStorage can throw (private windows, blocked site data); never let that break the UI.
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

/** Storage adapter for react-resizable-panels (layout sizes), wrapped in try/catch. */
export const panelStorage = {
  getItem: (name: string): string | null => safeStorage.getItem(name),
  setItem: (name: string, value: string): void => {
    safeStorage.setItem(name, value);
  },
};
