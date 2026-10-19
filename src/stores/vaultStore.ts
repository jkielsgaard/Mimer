import { create } from "zustand";
import { isManagedNote } from "@/features/fileTree/treeUtils";
import type { StandardKind } from "@/bindings/StandardKind";
import type { Project } from "@/bindings/Project";
import type { TreeNode } from "@/bindings/TreeNode";
import type { VaultConfig } from "@/bindings/VaultConfig";
import type { VaultInfo } from "@/bindings/VaultInfo";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { flattenTree, LinkResolver } from "@/lib/links";
import { basename, dirname, isInside, isMarkdown } from "@/lib/utils";
import { useEditorStore } from "./editorStore";
import { reportError, useUiStore } from "./uiStore";
import { forgetRename, noteRename } from "@/lib/renameHint";
import { useRecent } from "./recentStore";
import { useTitleFollow } from "./titleFollowStore";
import { useTreeStore } from "./treeStore";
import { useWorkspaceStore, layoutPersistence, filterExisting } from "./workspaceStore";
import { loadLayout, saveLayout } from "@/lib/workspacePersistence";

export interface VaultState {
  vault: VaultInfo | null;
  tree: TreeNode[];
  files: string[];
  resolver: LinkResolver;
  projects: Project[];
  /** The note shown in the editor. */
  activePath: string | null;
  /** The file or folder highlighted in the tree. */
  selectedPath: string | null;
  /** Bumped whenever the active note was rewritten on disk by a backend operation. */
  reloadNonce: number;
  /** Bumped when the search index changed (backlinks, search results refresh). */
  indexNonce: number;

  openVault: (path: string) => Promise<boolean>;
  createVault: (parent: string, name: string) => Promise<boolean>;
  closeVault: () => Promise<void>;
  refreshTree: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  openNote: (path: string | null) => Promise<void>;
  select: (path: string | null) => void;
  /**
   * Creates a note. With a name it is empty, or starts with the name as its heading when
   * `withHeading` is set. Without a name it starts as `# ` and takes the name of the title typed.
   */
  createNote: (folder: string, name?: string, withHeading?: boolean) => Promise<string | null>;
  /** Renames a new note to match its title: no commit, no link prompt, the editor keeps its state. */
  renameNewNote: (from: string, to: string) => Promise<boolean>;
  createFolder: (parent: string, name: string) => Promise<string | null>;
  /** `updateLinks` set skips the question (used when several items are moved at once). */
  renamePath: (from: string, to: string, updateLinks?: boolean) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
  createNoteFromTemplate: (
    folder: string,
    name: string,
    template: string | null,
  ) => Promise<string | null>;
  openDailyNote: () => Promise<string | null>;
  /** Creates a meeting note (with a title) or a quick note and opens it. */
  createStandardNote: (kind: StandardKind, title?: string) => Promise<string | null>;
  /** Creates (or refreshes) the index page of a folder and opens it. */
  createIndexPage: (folder: string) => Promise<string | null>;
  updateConfig: (config: VaultConfig) => Promise<boolean>;
}

const emptyResolver = new LinkResolver([]);

/** The project whose folder contains `path`. */
export function projectForPath(projects: readonly Project[], path: string | null): Project | null {
  if (path === null) return null;
  return projects.find((p) => isInside(path, p.folder)) ?? null;
}

/** The folder new notes should go into for the current selection. */
export function currentFolder(
  state: Pick<VaultState, "selectedPath" | "activePath" | "files" | "tree">,
): string {
  const sel = state.selectedPath ?? state.activePath;
  if (sel === null) return "";
  const isFile = state.files.includes(sel);
  return isFile ? dirname(sel) : sel;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  tree: [],
  files: [],
  resolver: emptyResolver,
  projects: [],
  activePath: null,
  selectedPath: null,
  reloadNonce: 0,
  indexNonce: 0,

  openVault: async (path) => {
    try {
      await flushPendingWrites();
      const vault = await api.openVault(path);
      // Read the saved tabs before anything can overwrite them.
      const saved = loadLayout(vault.path);
      set({ vault, activePath: null, selectedPath: null, tree: [], files: [], projects: [] });
      layoutPersistence.paused = true;
      useWorkspaceStore.getState().reset();
      layoutPersistence.paused = false;
      useEditorStore.getState().reset();
      useTreeStore.getState().reset();
      await Promise.all([get().refreshTree(), get().refreshProjects()]);
      await useTreeStore.getState().loadOrder();
      useRecent.getState().load(vault.path, get().files);
      if (saved) {
        layoutPersistence.paused = true;
        useWorkspaceStore.getState().restore(filterExisting(saved, get().files));
        layoutPersistence.paused = false;
      }
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  createVault: async (parent, name) => {
    try {
      const vault = await api.createVault(parent, name);
      return await get().openVault(vault.path);
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  closeVault: async () => {
    try {
      await flushPendingWrites();
      await api.closeVault();
    } catch (e) {
      reportError(e);
    }
    const closing = get().vault;
    if (closing) saveLayout(closing.path, useWorkspaceStore.getState().layout);
    layoutPersistence.paused = true;
    useWorkspaceStore.getState().reset();
    layoutPersistence.paused = false;
    set({ vault: null, tree: [], files: [], projects: [], activePath: null, selectedPath: null });
    useEditorStore.getState().reset();
    useTreeStore.getState().reset();
    useRecent.getState().reset();
  },

  refreshTree: async () => {
    try {
      const tree = await api.getTree();
      const files = flattenTree(tree);
      set({ tree, files, resolver: new LinkResolver(files) });
    } catch (e) {
      reportError(e);
    }
  },

  refreshProjects: async () => {
    try {
      set({ projects: await api.listProjects() });
    } catch (e) {
      reportError(e);
    }
  },

  openNote: async (path) => {
    if (path === null) {
      const active = get().activePath;
      if (active !== null) useWorkspaceStore.getState().close(active);
      return;
    }
    // Tasks and Ideas are not notes to the user: they are shown in their own areas.
    if (isManagedNote(path)) {
      useUiStore.getState().openArea(path === "Ideas.md" ? "ideas" : "tasks");
      return;
    }
    try {
      await flushPendingWrites();
    } catch (e) {
      reportError(e);
    }
    // Opens (or focuses) the tab in the focused pane. Switching away from the previous note is
    // handled by the editor, which saves and commits it.
    useWorkspaceStore.getState().open(path);
    useUiStore.getState().setCenterView("notes");
  },

  select: (path) => {
    set({ selectedPath: path });
  },

  createNote: async (folder, name, withHeading = false) => {
    try {
      const path = await api.createNote(folder, name);
      if (name !== undefined && withHeading) {
        await api.writeNote(path, `# ${name.replace(/\.md$/i, "")}\n\n`);
      } else if (name === undefined) {
        // A note without a name starts on its title line and is named after what is typed there.
        await api.writeNote(path, "# ");
        useTitleFollow.getState().start(path);
      }
      await get().refreshTree();
      await get().openNote(path);
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  renameNewNote: async (from, to) => {
    try {
      noteRename(from, to);
      await api.renameNoteQuietly(from, to);
      useWorkspaceStore.getState().renamePaths(from, to);
      useTitleFollow.getState().onRenamed(from, to, true);
      useRecent.getState().rename(from, to);
      set({ selectedPath: to });
      await get().refreshTree();
      return true;
    } catch (e) {
      forgetRename(to);
      reportError(e);
      return false;
    }
  },

  createFolder: async (parent, name) => {
    try {
      const path = await api.createFolder(parent, name);
      await get().refreshTree();
      set({ selectedPath: path });
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  renamePath: async (from, to, forcedUpdate) => {
    if (from === to) return false;
    try {
      await flushPendingWrites();
      let updateLinks = forcedUpdate ?? false;
      if (forcedUpdate === undefined) {
        const preview = await api.previewRename(from, to);
        if (preview.linkCount > 0) {
          const choice = await useUiStore.getState().askLinkUpdate(preview);
          if (choice === "cancel") return false;
          updateLinks = choice === "update";
        }
      }
      const result = await api.renamePath(from, to, updateLinks);
      // A name chosen by the user ends the "name follows the title" behaviour.
      useTitleFollow.getState().onRenamed(from, to, false);
      useRecent.getState().rename(from, to);
      useWorkspaceStore.getState().renamePaths(from, to);
      useTreeStore.getState().orderRenamed(from, to);
      set({ selectedPath: to });
      await Promise.all([get().refreshTree(), get().refreshProjects()]);
      // Notes whose links were rewritten on disk must be reloaded in the editor.
      if (result.changedFiles.length > 0) {
        set((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      }
      if (result.changedFiles.length > 0) {
        useUiStore
          .getState()
          .toast(`Updated links in ${result.changedFiles.length} note(s)`, "success");
      }
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  createNoteFromTemplate: async (folder, name, template) => {
    try {
      const path = await api.createNoteFromTemplate(folder, name, template);
      await get().refreshTree();
      await get().openNote(path);
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  createIndexPage: async (folder) => {
    try {
      await flushPendingWrites();
      const path = await api.createIndexPage(folder);
      await get().refreshTree();
      await get().openNote(path);
      useUiStore.getState().toast("Index page updated", "success");
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  createStandardNote: async (kind, title) => {
    try {
      const path = await api.createStandardNote(kind, title);
      await get().refreshTree();
      await get().openNote(path);
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  openDailyNote: async () => {
    try {
      const path = await api.openDailyNote();
      await get().refreshTree();
      await get().openNote(path);
      return path;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  updateConfig: async (config) => {
    const vault = get().vault;
    if (!vault) return false;
    try {
      const saved = await api.updateVaultConfig(config);
      set({ vault: { ...vault, config: saved } });
      useUiStore.getState().toast("Vault settings saved", "success");
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  deletePath: async (path) => {
    try {
      await flushPendingWrites();
      await api.deletePath(path);
      useTitleFollow.getState().onDeleted(path);
      useRecent.getState().remove(path);
      useWorkspaceStore.getState().removePaths(path);
      set({ selectedPath: dirname(path) || null });
      await Promise.all([get().refreshTree(), get().refreshProjects()]);
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },
}));

/** Name of the active note, for titles. */
export function activeTitle(path: string | null): string {
  return path === null
    ? ""
    : isMarkdown(path)
      ? basename(path).replace(/\.md$/i, "")
      : basename(path);
}
