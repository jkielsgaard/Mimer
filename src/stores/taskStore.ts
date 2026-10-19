import { create } from "zustand";
import type { MetaPatch } from "@/bindings/MetaPatch";
import type { Task } from "@/bindings/Task";
import { api, toApiError } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { quickTaskText, todayIso } from "@/lib/taskLogic";
import { reportError, useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

/** Which task the task page shows. The title helps to find it again if its line moved. */
export interface TaskRef {
  path: string;
  line: number;
  title: string;
}

export type GroupBy = "when" | "note" | "tag";

/** Which tasks the list shows: all open ones, one part of the time line, or the done ones. */
export type TaskWhen = "all" | "today" | "moved" | "week" | "later" | "done";

interface TaskState {
  tasks: Task[];
  loaded: boolean;
  loading: boolean;
  selected: TaskRef | null;
  groupBy: GroupBy;
  showDone: boolean;
  when: TaskWhen;
  /** Only the tasks with this tag (`null` = all). */
  tag: string | null;
  setWhen: (w: TaskWhen) => void;
  setTag: (t: string | null) => void;
  setGroupBy: (g: GroupBy) => void;
  setShowDone: (v: boolean) => void;
  /** Reads every task from every note. */
  load: () => Promise<void>;
  select: (ref: TaskRef | null) => void;
  /** Opens a task on the task page. */
  open: (t: Task) => void;
  /** Adds a task (a date word at the end becomes its due date) to the note `Tasks`. */
  add: (text: string, note?: string, steps?: string[]) => Promise<void>;
  /** Changes the title of a task or one of its steps. */
  rename: (path: string, line: number, key: string, title: string) => Promise<void>;
  setDone: (path: string, line: number, key: string, done: boolean) => Promise<void>;
  setMeta: (t: Task, patch: MetaPatch) => Promise<void>;
  /** Plans a task for today or for later. */
  plan: (t: Task, when: "today" | "later") => Promise<void>;
  /** Changes the status and writes it in the log. */
  setStatus: (t: Task, status: string | null) => Promise<void>;
  addStep: (t: Task, text: string) => Promise<void>;
  addLog: (t: Task, text: string) => Promise<void>;
  /** Adds tasks to a note (for example the ones the AI found in it). */
  addToNote: (path: string, texts: string[]) => Promise<void>;
  /** Drops a task: it is kept in the note but no longer shown as open. */
  drop: (t: Task) => Promise<void>;
  /** Deletes a task with its steps and log. The note is committed first, so History has it. */
  remove: (t: Task) => Promise<void>;
}

/** Replaces the tasks of one note in the list. */
function replaceNote(all: Task[], path: string, fresh: Task[]): Task[] {
  return [...all.filter((t) => t.path !== path), ...fresh];
}

/** Finds the task a reference points at. */
export function findTask(tasks: readonly Task[], ref: TaskRef | null): Task | null {
  if (ref === null) return null;
  const here = tasks.filter((t) => t.path === ref.path);
  return (
    here.find((t) => t.line === ref.line && t.title === ref.title) ??
    here.find((t) => t.title === ref.title) ??
    null
  );
}

export const useTaskStore = create<TaskState>((set, get) => {
  /** Runs one change of a note: saves the editor first, updates the list, reloads an open note. */
  const mutate = async (path: string, call: () => Promise<Task[]>): Promise<Task[] | null> => {
    try {
      await flushPendingWrites();
      const fresh = await call();
      set((s) => ({ tasks: replaceNote(s.tasks, path, fresh) }));
      if (useVaultStore.getState().activePath === path) {
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      }
      return fresh;
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "Conflict") {
        useUiStore.getState().toast(err.message, "error");
        void get().load();
      } else {
        reportError(e);
      }
      return null;
    }
  };

  return {
    tasks: [],
    loaded: false,
    loading: false,
    selected: null,
    groupBy: "when",
    showDone: false,
    when: "all",
    tag: null,
    setGroupBy: (groupBy) => {
      set({ groupBy });
    },
    setShowDone: (showDone) => {
      set({ showDone });
    },
    load: async () => {
      set({ loading: true });
      try {
        await flushPendingWrites();
        set({ tasks: await api.listTasks(), loaded: true });
      } catch (e) {
        reportError(e);
      } finally {
        set({ loading: false });
      }
    },
    select: (selected) => {
      set({ selected });
    },
    open: (t) => {
      set({ selected: { path: t.path, line: t.line, title: t.title } });
      useUiStore.getState().setCenterView("task");
    },
    add: async (text, note, steps) => {
      const line = quickTaskText(text, todayIso());
      if (line === "") return;
      const extra = note?.trim() ?? "";
      const list = (steps ?? []).filter((s) => s.trim() !== "");
      await mutate("Tasks.md", () =>
        extra === "" && list.length === 0
          ? api.taskAdd(line)
          : api.taskAdd(line, extra, todayIso(), list),
      );
    },
    rename: async (path, line, key, title) => {
      const fresh = await mutate(path, () => api.taskSetTitle(path, line, key, title));
      const sel = get().selected;
      if (fresh !== null && sel !== null && sel.path === path && sel.line === line) {
        const now = fresh.find((t) => t.line === line);
        if (now) set({ selected: { ...sel, title: now.title } });
      }
    },
    setWhen: (when) => {
      set({ when });
    },
    setTag: (tag) => {
      set({ tag });
    },
    setDone: async (path, line, key, done) => {
      await mutate(path, () => api.taskSetDone(path, line, key, done));
    },
    setMeta: async (t, patch) => {
      await mutate(t.path, () => api.taskSetMeta(t.path, t.line, t.key, patch));
    },
    plan: async (t, when) => {
      await get().setMeta(t, { plan: when === "today" ? todayIso() : "later" });
    },
    setStatus: async (t, status) => {
      const fresh = await mutate(t.path, () =>
        api.taskSetMeta(t.path, t.line, t.key, { status: status === "" ? null : status }),
      );
      const now = fresh?.find((x) => x.line === t.line);
      if (now && status !== null && status !== "") {
        await get().addLog(now, `Status: ${status}`);
      }
    },
    addStep: async (t, text) => {
      await mutate(t.path, () => api.taskAddStep(t.path, t.line, t.key, text));
    },
    addLog: async (t, text) => {
      await mutate(t.path, () => api.taskAddLog(t.path, t.line, t.key, todayIso(), text));
    },
    addToNote: async (path, texts) => {
      await mutate(path, () => api.taskAddToNote(path, texts));
    },
    drop: async (t) => {
      await get().setMeta(t, { status: "dropped" });
    },
    remove: async (t) => {
      const fresh = await mutate(t.path, () => api.taskDelete(t.path, t.line, t.key));
      if (fresh === null) return;
      if (get().selected?.title === t.title && get().selected?.path === t.path) {
        set({ selected: null });
        if (useUiStore.getState().centerView === "task")
          useUiStore.getState().setCenterView("tasks");
      }
      useUiStore
        .getState()
        .toast("Deleted the task. It can be brought back from the note's History.", "success");
    },
  };
});
