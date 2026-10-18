import { create } from "zustand";
import type { ChatEvent } from "@/bindings/ChatEvent";
import type { ResearchCard } from "@/bindings/ResearchCard";
import type { RunTarget } from "@/bindings/RunTarget";
import type { Skill } from "@/bindings/Skill";
import type { ChatSummary } from "@/bindings/ChatSummary";
import type { StoredChat } from "@/bindings/StoredChat";
import type { StoredMessage } from "@/bindings/StoredMessage";
import { api, toApiError } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { MAX_MENTIONS } from "@/lib/mentionQuery";
import { pushRecentSkill } from "@/lib/recentSkills";
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

/** A long skill run that did its first notes and waits for the user to go on. */
export interface SkillTrial {
  skillId: string;
  skillName: string;
  done: number;
  total: number;
  rest: RunTarget[];
  folders: string[];
  /** The extra instructions the user typed and the note the run started from. */
  skillInput: string | null;
  anchor: string | null;
  /** True once the user chose to continue (or the card is no longer current). */
  continued: boolean;
}

/** What `send` needs to continue a skill run after its trial. */
export interface SkillContinuation {
  skillId: string;
  skillName: string;
  rest: RunTarget[];
  folders: string[];
  skillInput: string | null;
  anchor: string | null;
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
  /** Set when a long skill run did only its first notes. */
  trial?: SkillTrial;
}

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  includeNote: boolean;
  /** Notes attached to the message being written (sent with the next message). */
  draftMentions: string[];
  /** The skill chosen for the message being written (it runs when the message is sent). */
  draftSkill: Skill | null;
  taskId: string | null;
  /** Id of the saved chat this conversation belongs to (null = not saved yet). */
  chatId: string | null;
  /** Saved chats of the open vault, newest first. */
  chats: ChatSummary[];
  setIncludeNote: (v: boolean) => void;
  setDraftSkill: (skill: Skill | null) => void;
  addMention: (path: string) => void;
  removeMention: (path: string) => void;
  send: (text: string, selection?: string, cont?: SkillContinuation) => Promise<void>;
  /** Continues the skill run whose trial is shown in message `messageId`. */
  continueSkill: (messageId: number) => Promise<void>;
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
  draftSkill: null,
  taskId: null,
  chatId: null,
  chats: [],

  setIncludeNote: (includeNote) => {
    set({ includeNote });
  },

  setDraftSkill: (draftSkill) => {
    set({ draftSkill });
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
        case "skillTrial":
          updated.trial = {
            skillId: e.skillId,
            skillName: e.skillName,
            done: e.done,
            total: e.total,
            rest: e.rest,
            folders: e.folders,
            skillInput: e.skillInput,
            anchor: e.anchor,
            continued: false,
          };
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

  send: async (text, selection, cont) => {
    const typed = text.trim();
    const skill = cont ? { id: cont.skillId, name: cont.skillName } : get().draftSkill;
    // A skill can run without any text: the notes and the skill are the message.
    if ((typed === "" && skill === null) || get().streaming) return;
    const trimmed = cont
      ? `Continue: ${cont.skillName} (${String(cont.rest.length)} more notes)`
      : skill === null
        ? typed
        : `Skill: ${skill.name}${typed === "" ? "" : `\n${typed}`}`;
    if (get().chatId === null) set({ chatId: crypto.randomUUID() });
    if (skill !== null && !cont) pushRecentSkill(skill.id);
    const vault = useVaultStore.getState();
    const mentions = cont ? [] : get().draftMentions;
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
    set({
      messages: [...history, assistant],
      streaming: true,
      draftMentions: [],
      draftSkill: null,
    });
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
          skill: skill?.id ?? null,
          skillInput: skill === null || typed === "" || cont ? null : typed,
          skillContinue: cont
            ? {
                targets: cont.rest,
                folders: cont.folders,
                skillInput: cont.skillInput,
                anchor: cont.anchor,
              }
            : null,
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

  continueSkill: async (messageId) => {
    const m = get().messages.find((x) => x.id === messageId);
    const trial = m?.trial;
    if (!trial || trial.continued || get().streaming) return;
    set((s) => ({
      messages: s.messages.map((x) =>
        x.id === messageId && x.trial ? { ...x, trial: { ...x.trial, continued: true } } : x,
      ),
    }));
    await get().send("", undefined, {
      skillId: trial.skillId,
      skillName: trial.skillName,
      rest: trial.rest,
      folders: trial.folders,
      skillInput: trial.skillInput,
      anchor: trial.anchor,
    });
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
    set({
      messages: [],
      streaming: false,
      taskId: null,
      chatId: null,
      draftMentions: [],
      draftSkill: null,
    });
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
      draftSkill: null,
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
