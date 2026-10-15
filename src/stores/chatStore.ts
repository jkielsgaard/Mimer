import { create } from "zustand";
import type { ChatEvent } from "@/bindings/ChatEvent";
import type { ResearchCard } from "@/bindings/ResearchCard";
import type { ChatSummary } from "@/bindings/ChatSummary";
import type { StoredChat } from "@/bindings/StoredChat";
import type { StoredMessage } from "@/bindings/StoredMessage";
import { api, toApiError } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { MAX_MENTIONS } from "@/lib/mentionQuery";
import { reportError, useUiStore } from "@/stores/uiStore";
import { currentFolder, projectForPath, useVaultStore } from "./vaultStore";

/** What Mimer is doing right now; shown live and never saved. */
export interface ChatProgress {
  phase: "connecting" | "waiting" | "writing" | "tool";
  /** Model call of this turn (1-based) and the most there can be; null before the first one. */
  step: number | null;
  max: number | null;
  /** For phase "tool": what the tool is about to do ("Reading Work/Plan.md"). */
  detail: string;
  startedAt: number;
  /** When the last event arrived; used to notice a stall. */
  lastEventAt: number;
  words: number;
}

/** Number of words in `text`. */
export function countWords(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Tool activity lines, e.g. "Searched notes for 'firewall'". */
  activity: string[];
  proposalSetId: string | null;
  error: string | null;
  /** Notes the user attached to this message with the `/` picker. */
  mentions: string[];
  /** Prompts for a cloud AI that Mimer wrote in this answer. */
  research: ResearchCard[];
  /** Live progress of an assistant message that is still being written. */
  progress?: ChatProgress;
}

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  includeNote: boolean;
  /** Notes attached to the message being written (sent with the next message). */
  draftMentions: string[];
  taskId: string | null;
  /** Id of the saved chat this conversation belongs to (null = not saved yet). */
  chatId: string | null;
  /** Saved chats of the open vault, newest first. */
  chats: ChatSummary[];
  setIncludeNote: (v: boolean) => void;
  addMention: (path: string) => void;
  removeMention: (path: string) => void;
  send: (text: string, selection?: string) => Promise<void>;
  stop: () => Promise<void>;
  newChat: () => void;
  /** Applies one streamed event to the last assistant message. */
  applyEvent: (e: ChatEvent) => void;
  refreshChats: () => Promise<void>;
  openChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  deleteAllChats: () => Promise<void>;
  /** Clears the conversation and the saved list (called when the vault changes). */
  resetForVault: () => void;
  /** Writes the conversation to the vault (no-op when empty). */
  persist: () => Promise<void>;
}

let nextId = 1;
let persistWarned = false;

/** Converts the in-memory conversation into the stored form. Null when there is nothing to keep. */
export function toStored(
  messages: ChatMessage[],
  chatId: string,
  projectId: string | null,
): StoredChat | null {
  if (!messages.some((m) => m.role === "user")) return null;
  const now = new Date().toISOString();
  const kept: StoredMessage[] = messages
    .filter(
      (m) =>
        !(
          m.role === "assistant" &&
          m.content === "" &&
          m.activity.length === 0 &&
          m.research.length === 0 &&
          m.error === null
        ),
    )
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      activity: m.activity,
      error: m.error,
      mentions: m.mentions,
      research: m.research,
    }));
  return {
    schemaVersion: 1,
    id: chatId,
    title: "",
    projectId,
    createdAt: now,
    updatedAt: now,
    messages: kept,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,
  includeNote: true,
  draftMentions: [],
  taskId: null,
  chatId: null,
  chats: [],

  setIncludeNote: (includeNote) => {
    set({ includeNote });
  },

  addMention: (path) => {
    const { draftMentions } = get();
    if (draftMentions.includes(path)) return;
    if (draftMentions.length >= MAX_MENTIONS) {
      useUiStore
        .getState()
        .toast(`You can attach up to ${String(MAX_MENTIONS)} notes to one message.`, "error");
      return;
    }
    set({ draftMentions: [...draftMentions, path] });
  },

  removeMention: (path) => {
    set({ draftMentions: get().draftMentions.filter((p) => p !== path) });
  },

  applyEvent: (e) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role !== "assistant") return s;
      const updated: ChatMessage = { ...last };
      const now = Date.now();
      const progress: ChatProgress = last.progress ?? {
        phase: "connecting",
        step: null,
        max: null,
        detail: "",
        startedAt: now,
        lastEventAt: now,
        words: 0,
      };
      const live = (patch: Partial<ChatProgress>): void => {
        updated.progress = { ...progress, ...patch, lastEventAt: now };
      };
      switch (e.type) {
        case "textDelta":
          updated.content += e.text;
          live({ phase: "writing", words: countWords(updated.content) });
          break;
        case "step":
          live({ phase: "waiting", step: e.step, max: e.max, detail: "" });
          break;
        case "toolStart":
          live({ phase: "tool", detail: e.detail });
          break;
        case "toolCall":
          updated.activity = [...updated.activity, e.summary];
          live({ phase: "waiting", detail: "" });
          break;
        case "proposalsReady":
          updated.proposalSetId = e.setId;
          break;
        case "researchPrompt":
          updated.research = [...updated.research, { title: e.title, text: e.text }];
          break;
        case "error":
          updated.error = e.error.message;
          delete updated.progress;
          break;
        case "done":
          delete updated.progress;
          break;
      }
      msgs[msgs.length - 1] = updated;
      return {
        messages: msgs,
        streaming: e.type === "done" || e.type === "error" ? false : s.streaming,
      };
    });
    if (e.type === "done" || e.type === "error") void get().persist();
  },

  send: async (text, selection) => {
    const trimmed = text.trim();
    if (trimmed === "" || get().streaming) return;
    if (get().chatId === null) set({ chatId: crypto.randomUUID() });
    const vault = useVaultStore.getState();
    const mentions = get().draftMentions;
    const user: ChatMessage = {
      id: nextId++,
      role: "user",
      content: trimmed,
      activity: [],
      proposalSetId: null,
      error: null,
      mentions,
      research: [],
    };
    const assistant: ChatMessage = {
      id: nextId++,
      role: "assistant",
      content: "",
      activity: [],
      proposalSetId: null,
      error: null,
      mentions: [],
      research: [],
    };
    const history = [...get().messages, user];
    const startedAt = Date.now();
    assistant.progress = {
      phase: "connecting",
      step: null,
      max: null,
      detail: "",
      startedAt,
      lastEventAt: startedAt,
      words: 0,
    };
    set({ messages: [...history, assistant], streaming: true, draftMentions: [] });
    void get().persist();
    try {
      await flushPendingWrites();
      const taskId = await api.aiChat(
        {
          messages: history
            .filter((m) => m.content !== "")
            .map((m) => ({ role: m.role, content: m.content, activity: m.activity })),
          includeCurrentNote: get().includeNote,
          mentions,
          notePath: vault.activePath,
          folder: vault.activePath === null ? currentFolder(vault) : null,
          selection: selection ?? null,
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
    set((s) => ({
      streaming: false,
      messages: s.messages.map((m) => {
        if (m.progress === undefined) return m;
        const copy = { ...m };
        delete copy.progress;
        return copy;
      }),
    }));
    void get().persist();
  },

  newChat: () => {
    const { taskId, streaming } = get();
    if (streaming && taskId !== null) void api.aiCancel(taskId).catch(() => undefined);
    set({ messages: [], streaming: false, taskId: null, chatId: null, draftMentions: [] });
  },

  refreshChats: async () => {
    try {
      set({ chats: await api.listChats() });
    } catch (e) {
      reportError(e);
    }
  },

  openChat: async (id) => {
    if (get().streaming) return;
    try {
      const chat = await api.loadChat(id);
      const messages: ChatMessage[] = chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        activity: m.activity,
        proposalSetId: null,
        error: m.error,
        mentions: m.mentions,
        research: m.research,
      }));
      nextId = Math.max(nextId, ...messages.map((m) => m.id + 1));
      set({ messages, chatId: chat.id, taskId: null, streaming: false });
    } catch (e) {
      reportError(e);
    }
  },

  deleteChat: async (id) => {
    try {
      await api.deleteChat(id);
      if (get().chatId === id) get().newChat();
      await get().refreshChats();
    } catch (e) {
      reportError(e);
    }
  },

  deleteAllChats: async () => {
    try {
      await api.deleteAllChats();
      get().newChat();
      await get().refreshChats();
    } catch (e) {
      reportError(e);
    }
  },

  resetForVault: () => {
    set({
      messages: [],
      streaming: false,
      taskId: null,
      chatId: null,
      chats: [],
      draftMentions: [],
    });
  },

  persist: async () => {
    const { messages, chatId } = get();
    if (chatId === null) return;
    const vault = useVaultStore.getState();
    const anchor = vault.activePath ?? currentFolder(vault);
    const projectId = projectForPath(vault.projects, anchor === "" ? null : anchor)?.id ?? null;
    const stored = toStored(messages, chatId, projectId);
    if (stored === null) return;
    try {
      await api.saveChat(stored);
      persistWarned = false;
      await get().refreshChats();
    } catch (e) {
      if (!persistWarned) {
        persistWarned = true;
        reportError(e);
      }
    }
  },
}));
