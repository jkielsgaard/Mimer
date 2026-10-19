import { create } from "zustand";
import type { Idea } from "@/bindings/Idea";
import { api, toApiError } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { todayIso } from "@/lib/taskLogic";
import { reportError, useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

export type IdeaStatus = "used" | "archived" | null;

/** Which ideas the panel lists: the open ones, the ones turned into something, or archived. */
export type IdeaFilter = "open" | "used" | "archived";

interface IdeaState {
  ideas: Idea[];
  loaded: boolean;
  filter: IdeaFilter;
  /** The line of the idea that is open in the middle. */
  selectedLine: number | null;
  setFilter: (f: IdeaFilter) => void;
  select: (line: number | null) => void;
  load: () => Promise<void>;
  /** Writes an idea down. With `open`, the new idea is opened in the Ideas area. */
  add: (text: string, note?: string, open?: boolean) => Promise<boolean>;
  edit: (idea: Idea, text: string, note: string) => Promise<boolean>;
  setStatus: (idea: Idea, status: IdeaStatus) => Promise<void>;
  /** Deletes an idea and its note. The note Ideas is committed first, so History has it. */
  remove: (idea: Idea) => Promise<void>;
}

export const useIdeaStore = create<IdeaState>((set, get) => {
  const run = async (call: () => Promise<Idea[]>): Promise<boolean> => {
    try {
      await flushPendingWrites();
      set({ ideas: await call(), loaded: true });
      if (useVaultStore.getState().activePath === "Ideas.md") {
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      }
      return true;
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "Conflict") {
        useUiStore.getState().toast(err.message, "error");
        void get().load();
      } else {
        reportError(e);
      }
      return false;
    }
  };
  return {
    ideas: [],
    loaded: false,
    filter: "open",
    selectedLine: null,
    setFilter: (filter) => {
      set({ filter });
    },
    select: (selectedLine) => {
      set({ selectedLine });
    },
    load: async () => {
      try {
        await flushPendingWrites();
        set({ ideas: await api.listIdeas(), loaded: true });
      } catch (e) {
        reportError(e);
      }
    },
    add: async (text, note = "", open = false) => {
      const ok = await run(() =>
        note.trim() === "" ? api.ideaAdd(todayIso(), text) : api.ideaAdd(todayIso(), text, note),
      );
      if (ok && open) {
        // The newest idea is first in the list.
        set((s) => ({ selectedLine: s.ideas[0]?.line ?? null, filter: "open" }));
        useUiStore.getState().setCenterView("ideas");
      }
      return ok;
    },
    edit: (idea, text, note) => run(() => api.ideaEdit(idea.line, idea.key, text, note)),
    setStatus: async (idea, status) => {
      await run(() => api.ideaSetStatus(idea.line, idea.key, status));
    },
    remove: async (idea) => {
      if (!(await run(() => api.ideaDelete(idea.line, idea.key)))) return;
      set({ selectedLine: null });
      useUiStore
        .getState()
        .toast("Deleted the idea. It can be brought back from the History of Ideas.", "success");
    },
  };
});
