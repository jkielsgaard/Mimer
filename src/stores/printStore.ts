import { create } from "zustand";
import type { ExportRequest } from "@/bindings/ExportRequest";
import { api } from "@/lib/api";
import { reportError } from "@/stores/uiStore";

interface PrintState {
  /** Full HTML document to preview; null when the preview is closed. */
  html: string | null;
  title: string;
  start: (request: ExportRequest, title: string) => Promise<void>;
  finish: () => void;
}

/** The PDF route: the backend renders HTML, the user prints it through the system print dialog. */
export const usePrintStore = create<PrintState>((set) => ({
  html: null,
  title: "",
  start: async (request, title) => {
    try {
      const html = await api.exportPreviewHtml(request);
      set({ html, title });
    } catch (e) {
      reportError(e);
    }
  },
  finish: () => {
    set({ html: null });
  },
}));
