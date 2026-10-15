import { create } from "zustand";
import type { EmbeddingStatus } from "@/bindings/EmbeddingStatus";
import { api, toApiError } from "@/lib/api";
import { reportError } from "@/stores/uiStore";

interface EmbeddingState {
  status: EmbeddingStatus | null;
  load: () => Promise<void>;
  setStatus: (s: EmbeddingStatus) => void;
  start: (rebuild: boolean) => Promise<void>;
  cancel: () => Promise<void>;
}

/** Semantic search status (driven by `embeddings://status` events and explicit calls). */
export const useEmbeddingStore = create<EmbeddingState>((set) => ({
  status: null,
  load: async () => {
    try {
      set({ status: await api.getEmbeddingStatus() });
    } catch {
      /* no vault open or semantic search not configured */
    }
  },
  setStatus: (status) => {
    set({ status });
  },
  start: async (rebuild) => {
    try {
      await api.startEmbeddingIndex(rebuild);
    } catch (e) {
      reportError(toApiError(e));
    }
  },
  cancel: async () => {
    try {
      await api.cancelEmbeddingIndex();
    } catch (e) {
      reportError(toApiError(e));
    }
  },
}));
