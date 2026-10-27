import { create } from "zustand";
import type { MetaPatch } from "@/bindings/MetaPatch";
import type { Epic } from "@/bindings/Epic";
import type { Task } from "@/bindings/Task";
import type { TaskLog } from "@/bindings/TaskLog";
import type { TaskStep } from "@/bindings/TaskStep";
import { api, toApiError } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { taskText, todayIso } from "@/lib/taskLogic";
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
  /** Epics that are folded (`true`) or unfolded (`false`) in the list, remembered. An epic that
   * is not in it is open, unless all its tasks are done. */
  folded: Record<string, boolean>;
  /** Folds or unfolds epics (several at once for "Fold all"). */
  setFolded: (paths: readonly string[], folded: boolean) => void;
  /** Tasks whose steps are shown in the list (`path:line`), for this session only. */
  openTasks: Record<string, boolean>;
  toggleTaskOpen: (id: string) => void;
  /** Reads every task from every note, and the epics. */
  load: () => Promise<void>;
  /** The epics in the order the user chose (note paths), from the vault. */
  epicOrder: string[];
  /** Moves an epic one place up or down among `shown` (the epics in the order on screen). */
  moveEpic: (path: string, up: boolean, shown: readonly string[]) => Promise<void>;
  /** Moves a task (with its steps) or a step one place up or down in its note. */
  move: (path: string, line: number, key: string, up: boolean) => Promise<void>;
  /** Changes the title of an epic (its heading; the note keeps its name). */
  renameEpic: (path: string, title: string) => Promise<void>;
  /** Makes a note that has tasks an epic (it gets the tag `epic`). */
  adoptEpic: (path: string) => Promise<void>;
  /** Makes several notes epics at once. TEMPORARY: remove in the release after 0.18.0. */
  adoptEpics: (paths: readonly string[]) => Promise<void>;
  /** Points a task at a note (a link target), or takes the link off with `null`. */
  setLink: (t: Task, link: string | null) => Promise<void>;
  /**
   * Makes a note for a task, links the task to it and writes a line in the note that points back.
   * Resolves to the new note's path, or null when it could not be made.
   */
  makeNote: (
    t: Task,
    opts: { name: string; folder: string; template: string | null },
  ) => Promise<string | null>;
  /** Deletes a step. The note is committed first, and a toast can bring the step back. */
  removeStep: (t: Task, step: TaskStep) => Promise<void>;
  /** Opens an epic on its page. */
  openEpic: (path: string) => void;
  /** Makes a new epic (a note in `Tasks/`) and opens it, unless `open` is false. Resolves to its note. */
  createEpic: (title: string, open?: boolean) => Promise<string | null>;
  /** The epic note for a note: itself when it is in `Tasks/`, else the one made for it. */
  epicFor: (note: string) => Promise<string | null>;
  select: (ref: TaskRef | null) => void;
  /** Opens a task on the task page. */
  open: (t: Task) => void;
  /**
   * Adds a task to an epic: the one at `path`, or the Inbox when none is given. What was typed is
   * the title; Mimer adds the day it was made.
   */
  add: (text: string, note?: string, steps?: string[], path?: string) => Promise<void>;
  /** Changes the title of a task or one of its steps. */
  rename: (path: string, line: number, key: string, title: string) => Promise<void>;
  setDone: (path: string, line: number, key: string, done: boolean) => Promise<void>;
  setMeta: (t: Task, patch: MetaPatch) => Promise<void>;
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
  /** Sets the description of an epic (the text under its heading). */
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
    setFolded: (paths, value) => {
      const folded = { ...get().folded };
      for (const p of paths) folded[p] = value;
      set({ folded });
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(folded));
      } catch {
        /* only a convenience */
      }
    },
    openTasks: {},
    toggleTaskOpen: (id) => {
      set((s) => ({ openTasks: { ...s.openTasks, [id]: !s.openTasks[id] } }));
    },
    openEpic: (path) => {
      set({ epicPath: path });
      useUiStore.getState().setCenterView("epic");
    },
    renameEpic: async (path, title) => {
      try {
        await flushPendingWrites();
        const e = await api.epicSetTitle(path, title);
        set((s) => ({ epics: s.epics.map((x) => (x.path === e.path ? e : x)) }));
        if (useVaultStore.getState().activePath === path) {
          useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
        }
      } catch (e) {
        reportError(e);
      }
    },
    setLink: async (t, link) => {
      await mutate(t.path, () => api.taskSetLink(t.path, t.line, t.key, link));
    },
    makeNote: async (t, opts) => {
      try {
        await flushPendingWrites();
        const path = await api.createNoteFromTemplate(opts.folder, opts.name, opts.template);
        const note = await api.readNote(path);
        const vault = useVaultStore.getState();
        const back = vault.resolver.shortestForm(t.path);
        await api.writeNote(path, `${note.content.trimEnd()}\n\nTask in [[${back}]]\n`);
        await vault.refreshTree();
        const resolver = useVaultStore.getState().resolver;
        const stem = path.replace(/\.md$/i, "");
        const name = stem.split("/").pop() ?? stem;
        await get().setLink(t, resolver.resolve(name) === path ? name : stem);
        return path;
      } catch (e) {
        reportError(e);
        return null;
      }
    },
    adoptEpic: async (path) => {
      try {
        await flushPendingWrites();
        const e = await api.epicAdopt(path);
        set((s) => ({ epics: [...s.epics.filter((x) => x.path !== e.path), e] }));
        if (useVaultStore.getState().activePath === path) {
          useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
        }
      } catch (e) {
        reportError(e);
      }
    },
    adoptEpics: async (paths) => {
      for (const p of paths) await get().adoptEpic(p);
    },
    removeStep: async (t, step) => {
      const fresh = await mutate(t.path, () => api.taskDelete(t.path, step.line, step.key));
      if (fresh === null) return;
      useUiStore.getState().toast("Deleted the step.", "success", {
        label: "Undo",
        run: () => {
          const owner = get().tasks.find((x) => x.path === t.path && x.line === t.line) ?? t;
          void get().addStep(owner, step.text);
        },
      });
    },
    createEpic: async (title, open = true) => {
      try {
        await flushPendingWrites();
        const e = await api.epicCreate(title);
        set((s) => ({ epics: [...s.epics.filter((x) => x.path !== e.path), e] }));
        await useVaultStore.getState().refreshTree();
        if (open) get().openEpic(e.path);
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
        const [tasks, epics, epicOrder] = await Promise.all([
          api.listTasks(),
          api.listEpics(),
          api.getEpicOrder().catch(() => [] as string[]),
        ]);
        set({ tasks, epics, epicOrder, loaded: true });
      } catch (e) {
        reportError(e);
      } finally {
        set({ loading: false });
      }
    },
    epicOrder: [],
    moveEpic: async (path, up, shown) => {
      const list = shown.filter((p) => p !== INBOX_PATH);
      const i = list.indexOf(path);
      const j = up ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= list.length) return;
      const swapped = [...list];
      [swapped[i], swapped[j]] = [swapped[j] ?? path, swapped[i] ?? path];
      // Epics not shown (the done ones) keep their place after the shown ones.
      const next = [...swapped, ...get().epicOrder.filter((p) => !swapped.includes(p))];
      set({ epicOrder: next });
      try {
        await api.setEpicOrder(next);
      } catch (e) {
        reportError(e);
      }
    },
    move: async (path, line, key, up) => {
      await mutate(path, () => api.taskMove(path, line, key, up));
    },
    select: (selected) => {
      set({ selected });
    },
    open: (t) => {
      set({ selected: { path: t.path, line: t.line, title: t.title } });
      useUiStore.getState().setCenterView("task");
    },
    add: async (text, note, steps, path) => {
      const line = taskText(text);
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
