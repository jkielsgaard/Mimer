import { create } from "zustand";
import { ancestorsOf, type OrderMap, type SortMode } from "@/features/fileTree/treeUtils";
import { api } from "@/lib/api";
import { reportError } from "@/stores/uiStore";
import { safeStorage } from "@/lib/safeStorage";

const SORT_KEY = "mimer-tree-sort";

const SECTION_PREFIX = "mimer-section:";
const PROJECT_PREFIX = "mimer-project:";

/** Whether a sidebar section was left open (sections start open). */
export function savedSectionOpen(key: string): boolean {
  return safeStorage.getItem(SECTION_PREFIX + key) !== "closed";
}

function savedProjectOpen(folder: string): boolean {
  return safeStorage.getItem(PROJECT_PREFIX + folder) !== "closed";
}

function savedSort(): SortMode {
  const saved = safeStorage.getItem(SORT_KEY);
  return saved === "modified" || saved === "manual" ? saved : "name";
}

interface TreeState {
  /** Folders that are open in the file tree. */
  expanded: ReadonlySet<string>;
  /** Text in the filter box above the tree. */
  filter: string;
  sort: SortMode;
  /** The order the user chose for each folder (used when `sort` is "manual"). */
  order: OrderMap;
  /** Reads the chosen order from the vault. A missing order is not an error. */
  loadOrder: () => Promise<void>;
  /** Saves the order of one folder (`names` in the order to show). */
  setFolderOrder: (folder: string, names: string[]) => Promise<void>;
  /** A file or folder was renamed or moved: keep its place in the order. */
  orderRenamed: (from: string, to: string) => void;
  /** Files and folders ticked with Ctrl/Cmd+click or Shift+click, for acting on several at once. */
  multi: ReadonlySet<string>;
  setMulti: (paths: Iterable<string>) => void;
  clearMulti: () => void;
  /** Sections of the file panel that were opened or folded this session (see `savedSectionOpen`). */
  sectionOpen: Readonly<Record<string, boolean>>;
  /** Project trees that were opened or folded this session. */
  projectOpen: Readonly<Record<string, boolean>>;
  setSectionOpen: (key: string, open: boolean) => void;
  setProjectOpen: (folder: string, open: boolean) => void;
  toggle: (path: string) => void;
  /** Opens a folder and every folder above it. */
  expand: (folder: string) => void;
  /** Opens every folder above a file or folder. */
  expandAncestors: (path: string) => void;
  collapseAll: () => void;
  setFilter: (text: string) => void;
  setSort: (mode: SortMode) => void;
  reset: () => void;
}

/** Which folders are open, the filter text and the sort order of the file tree. */
export const useTreeStore = create<TreeState>((set, get) => ({
  expanded: new Set(),
  filter: "",
  sort: savedSort(),
  order: {},
  loadOrder: async () => {
    try {
      set({ order: (await api.getTreeOrder()).folders });
    } catch {
      set({ order: {} });
    }
  },
  setFolderOrder: async (folder, names) => {
    const next = Object.fromEntries(Object.entries(get().order).filter(([f]) => f !== folder));
    if (names.length > 0) next[folder] = names;
    set({ order: next });
    try {
      await api.setFolderOrder(folder, names);
    } catch (e) {
      reportError(e);
      await get().loadOrder();
    }
  },
  orderRenamed: (from, to) => {
    const old = get().order;
    const slash = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf("/")));
    const name = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
    const next: Record<string, readonly string[]> = {};
    const changed = new Set<string>();
    for (const [folder, names] of Object.entries(old)) {
      // The folder itself (or one inside it) moved: its list follows it.
      const target =
        folder === from
          ? to
          : folder.startsWith(`${from}/`)
            ? `${to}${folder.slice(from.length)}`
            : folder;
      if (target !== folder) {
        changed.add(folder);
        changed.add(target);
      }
      next[target] = names;
    }
    const oldParent = slash(from);
    const newParent = slash(to);
    const list = next[oldParent];
    if (list?.includes(name(from))) {
      changed.add(oldParent);
      // A rename in the same folder keeps the place; a move to another folder leaves the list.
      next[oldParent] =
        oldParent === newParent
          ? list.map((n) => (n === name(from) ? name(to) : n))
          : list.filter((n) => n !== name(from));
    }
    if (changed.size === 0) return;
    set({ order: next });
    for (const folder of changed) {
      api.setFolderOrder(folder, [...(next[folder] ?? [])]).catch(reportError);
    }
  },
  multi: new Set(),
  setMulti: (paths) => {
    set({ multi: new Set(paths) });
  },
  clearMulti: () => {
    if (get().multi.size > 0) set({ multi: new Set() });
  },
  sectionOpen: {},
  projectOpen: {},
  setSectionOpen: (key, open) => {
    safeStorage.setItem(SECTION_PREFIX + key, open ? "open" : "closed");
    set({ sectionOpen: { ...get().sectionOpen, [key]: open } });
  },
  setProjectOpen: (folder, open) => {
    safeStorage.setItem(PROJECT_PREFIX + folder, open ? "open" : "closed");
    set({ projectOpen: { ...get().projectOpen, [folder]: open } });
  },
  toggle: (path) => {
    const next = new Set(get().expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set({ expanded: next });
  },
  expand: (folder) => {
    set({ expanded: new Set([...get().expanded, ...ancestorsOf(`${folder}/x`)]) });
  },
  expandAncestors: (path) => {
    set({ expanded: new Set([...get().expanded, ...ancestorsOf(path)]) });
  },
  collapseAll: () => {
    set({ expanded: new Set() });
  },
  setFilter: (filter) => {
    set({ filter });
  },
  setSort: (sort) => {
    safeStorage.setItem(SORT_KEY, sort);
    set({ sort });
  },
  reset: () => {
    set({ expanded: new Set(), filter: "", multi: new Set(), order: {} });
  },
}));

/** True when a project tree is open: this session's choice, else the remembered one. */
export function isProjectOpen(state: Pick<TreeState, "projectOpen">, folder: string): boolean {
  return state.projectOpen[folder] ?? savedProjectOpen(folder);
}
