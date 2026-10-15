import { create } from "zustand";
import type { ChatEvent } from "@/bindings/ChatEvent";
import { api, toApiError } from "@/lib/api";

export interface RavenMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  error: string | null;
}

interface RavenState {
  messages: RavenMessage[];
  streaming: boolean;
  taskId: string | null;
  /** Text in the message box. Other parts of the app can fill it (it is never sent for the user). */
  draft: string;
  setDraft: (text: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  newChat: () => void;
  applyEvent: (e: ChatEvent) => void;
}

let nextId = 1;

/**
 * The Raven chat. It lives in memory only and is never written to the vault. A request carries
 * the messages and nothing else: Raven has no access to notes.
 */
export const useRavenStore = create<RavenState>((set, get) => ({
  messages: [],
  streaming: false,
  taskId: null,
  draft: "",

  setDraft: (draft) => {
    set({ draft });
  },

  applyEvent: (e) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role !== "assistant") return s;
      const updated: RavenMessage = { ...last };
      if (e.type === "textDelta") updated.content += e.text;
      if (e.type === "error") updated.error = e.error.message;
      msgs[msgs.length - 1] = updated;
      return {
        messages: msgs,
        streaming: e.type === "done" || e.type === "error" ? false : s.streaming,
      };
    });
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (trimmed === "" || get().streaming) return;
    const user: RavenMessage = { id: nextId++, role: "user", content: trimmed, error: null };
    const assistant: RavenMessage = { id: nextId++, role: "assistant", content: "", error: null };
    const history = [...get().messages, user];
    set({ messages: [...history, assistant], streaming: true, draft: "" });
    try {
      const taskId = await api.ravenChat(
        {
          messages: history
            .filter((m) => m.content !== "")
            .map((m) => ({ role: m.role, content: m.content })),
        },
        get().applyEvent,
      );
      set({ taskId });
    } catch (e) {
      get().applyEvent({
        type: "error",
        error: { code: "Provider", message: toApiError(e).message },
      });
    }
  },

  stop: async () => {
    const { taskId } = get();
    if (taskId !== null) {
      try {
        await api.aiCancel(taskId);
      } catch {
        /* the task may already be finished */
      }
    }
    set({ streaming: false });
  },

  newChat: () => {
    const { taskId, streaming } = get();
    if (streaming && taskId !== null) void api.aiCancel(taskId).catch(() => undefined);
    set({ messages: [], streaming: false, taskId: null });
  },
}));
