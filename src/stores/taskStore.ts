import { create } from "zustand";
import type { MetaPatch } from "@/bindings/MetaPatch";
import type { Epic } from "@/bindings/Epic";
import type { Task } from "@/bindings/Task";
import type { TaskLog } from "@/bindings/TaskLog";
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

/** The epic that quick tasks go into when no epic is chosen. */
export const INBOX_PATH = "Tasks/Inbox.md";

const FOLD_KEY = "mimer.foldedEpics";

function readFolded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

interface TaskState {
  tasks: Task[];
  loaded: boolean;
  loading: boolean;
  selected: TaskRef | null;
  /** The epic notes (the notes in `Tasks/`). Notes with tasks elsewhere are epics too. */
  epics: Epic[];
  /** The epic that is open on its page. */
  epicPath: string | null;
  /** Epics that are folded in the list (remembered). */
  folded: Record<string, boolean>;
  toggleFold: (path: string) => void;
  /** Reads every task from every note, and the epics. */
  load: () => Promise<void>;
  /** Opens an epic on its page. */
  openEpic: (path: string) => void;
  /** Makes a new epic task (a note in `Tasks/`) and opens it. Resolves to its note. */
  createEpic: (title: string) => Promise<string | null>;
  /** The epic note for a note: itself when it is in `Tasks/`, else the one made for it. */
  epicFor: (note: string) => Promise<string | null>;
  select: (ref: TaskRef | null) => void;
  /** Opens a task on the task page. */
  open: (t: Task) => void;
  /**
   * Adds a task (a date word at the end becomes its due date) to an epic: the one at `path`, or the
   * Inbox when none is given.
   */
  add: (text: string, note?: string, steps?: string[], path?: string) => Promise<void>;
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
  /** Changes the date and text of one line of the log. */
  editLog: (t: Task, l: TaskLog, date: string, text: string) => Promise<void>;
  /** Deletes one line of the log. The note is committed first, so History has it. */
  deleteLog: (t: Task, l: TaskLog) => Promise<void>;
  /** Sets the note of a task (empty text removes it). */
  setNote: (t: Task, text: string) => Promise<void>;
  /** Sets the description of an epic task (the text under its heading). */
  setDescription: (epicPath: string, text: string) => Promise<void>;
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
    epics: [],
    epicPath: null,
    folded: readFolded(),
    toggleFold: (path) => {
      const folded = { ...get().folded, [path]: !get().folded[path] };
      set({ folded });
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(folded));
      } catch {
        /* only a convenience */
      }
    },
    openEpic: (path) => {
      set({ epicPath: path });
      useUiStore.getState().setCenterView("epic");
    },
    createEpic: async (title) => {
      try {
        await flushPendingWrites();
        const e = await api.epicCreate(title);
        set((s) => ({ epics: [...s.epics.filter((x) => x.path !== e.path), e] }));
        await useVaultStore.getState().refreshTree();
        get().openEpic(e.path);
        return e.path;
      } catch (e) {
        reportError(e);
        return null;
      }
    },
    epicFor: async (note) => {
      try {
        await flushPendingWrites();
        const e = await api.epicForNote(note);
        set((s) => ({ epics: [...s.epics.filter((x) => x.path !== e.path), e] }));
        await useVaultStore.getState().refreshTree();
        return e.path;
      } catch (e) {
        reportError(e);
        return null;
      }
    },
    load: async () => {
      set({ loading: true });
      try {
        await flushPendingWrites();
        const [tasks, epics] = await Promise.all([api.listTasks(), api.listEpics()]);
        set({ tasks, epics, loaded: true });
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
    add: async (text, note, steps, path) => {
      const line = quickTaskText(text, todayIso());
      if (line === "") return;
      const extra = note?.trim() ?? "";
      const list = (steps ?? []).filter((s) => s.trim() !== "");
      const target = path ?? INBOX_PATH;
      const fresh = await mutate(target, () =>
        extra === "" && list.length === 0 && path === undefined
          ? api.taskAdd(line)
          : api.taskAdd(line, extra === "" ? undefined : extra, list, target),
      );
      // A first task makes its note, so the epic list may have a new entry.
      if (fresh !== null && !get().epics.some((e) => e.path === target)) {
        await get().load();
        await useVaultStore.getState().refreshTree();
      }
    },
    rename: async (path, line, key, title) => {
      const fresh = await mutate(path, () => api.taskSetTitle(path, line, key, title));
      const sel = get().selected;
      if (fresh !== null && sel !== null && sel.path === path && sel.line === line) {
        const now = fresh.find((t) => t.line === line);
        if (now) set({ selected: { ...sel, title: now.title } });
      }
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
    editLog: async (t, l, date, text) => {
      await mutate(t.path, () => api.taskEditLog(t.path, l.line, l.key, date, text));
    },
    deleteLog: async (t, l) => {
      await mutate(t.path, () => api.taskDeleteLog(t.path, l.line, l.key));
    },
    setNote: async (t, text) => {
      await mutate(t.path, () => api.taskSetNote(t.path, t.line, t.key, text));
    },
    setDescription: async (epicPath, text) => {
      try {
        await flushPendingWrites();
        const e = await api.epicSetDescription(epicPath, text);
        set((s) => ({ epics: s.epics.map((x) => (x.path === e.path ? e : x)) }));
        if (useVaultStore.getState().activePath === epicPath) {
          useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
        }
      } catch (e) {
        reportError(e);
      }
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
