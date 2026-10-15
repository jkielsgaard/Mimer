// Cross-cutting user actions shared by menus, shortcuts and the editor.
import { convertFileSrc } from "@tauri-apps/api/core";
import { openLink } from "@/lib/openLink";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { basename, dirname, isInside, isMarkdown, resolveRelativePath } from "@/lib/utils";
import { useTreeStore } from "@/stores/treeStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/** Mod+S: write the buffer and commit the current note. */
export async function saveActiveNote(): Promise<void> {
  const path = useVaultStore.getState().activePath;
  if (path === null) return;
  try {
    await flushPendingWrites();
    await api.commitNow({ kind: "save", detail: path }, [path]);
  } catch (e) {
    reportError(e);
  }
}

/** Mod+N, New → Note and the menus: asks for the name of a new note in the current folder. */
export function newNoteInCurrentFolder(): void {
  const vault = useVaultStore.getState();
  const configured = vault.vault?.config.newNoteFolder ?? "";
  const folder = currentFolder(vault) || configured;
  useUiStore.getState().openNewNoteDialog(folder);
}

/**
 * Shows a file or folder in the file tree: clears the filter, opens the folders above it,
 * selects it and scrolls to it. Also opens the Files tab if another one was showing.
 */
export function revealInTree(path: string): void {
  const tree = useTreeStore.getState();
  tree.setFilter("");
  if (useVaultStore.getState().files.includes(path)) tree.expandAncestors(path);
  else tree.expand(path);
  // A project's files are listed under Projects, so open that section and the project's tree.
  const project = useVaultStore.getState().projects.find((p) => isInside(path, p.folder));
  if (project) {
    tree.setSectionOpen("projects", true);
    tree.setProjectOpen(project.folder, true);
  }
  useVaultStore.getState().select(path);
  useUiStore.getState().setLeftTab("files");
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-tree-path="${path.replace(/"/g, '\\"')}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

/** Webview URL for a vault-relative file (asset protocol). */
export function assetUrlFor(vaultPath: string): string {
  const root = (useVaultStore.getState().vault?.path ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  return convertFileSrc(`${root}/${vaultPath}`);
}

/** Opens a wiki-link target; creates the note when it does not exist yet. */
export async function openWikiLink(target: string, resolved: string | null): Promise<void> {
  const vault = useVaultStore.getState();
  if (resolved !== null) {
    if (isMarkdown(resolved)) await vault.openNote(resolved);
    else await api.openAttachment(resolved).catch(reportError);
    return;
  }
  const clean = target.trim();
  const name = basename(clean);
  const folder = clean.includes("/")
    ? dirname(clean)
    : dirname(vault.activePath ?? "") || (vault.vault?.config.newNoteFolder ?? "");
  await vault.createNote(folder, name);
}

/** Opens a standard Markdown link: external URLs in the browser, files in the app or OS. */
export async function openHref(href: string, notePath: string): Promise<void> {
  if (/^(https?:|mailto:)/i.test(href)) {
    await openLink(href);
    return;
  }
  const vaultPath = resolveRelativePath(notePath, href);
  if (vaultPath === null) return;
  const vault = useVaultStore.getState();
  if (isMarkdown(vaultPath) && vault.files.includes(vaultPath)) {
    await vault.openNote(vaultPath);
    return;
  }
  try {
    await api.openAttachment(vaultPath);
  } catch (e) {
    reportError(e);
  }
}

/** Opens the file in the app (notes) or with the OS default app (everything else). */
export async function openFile(path: string): Promise<void> {
  if (isMarkdown(path)) await useVaultStore.getState().openNote(path);
  else {
    try {
      await api.openAttachment(path);
    } catch (e) {
      reportError(e);
    }
  }
}

/** Runs a tag search in the search panel. */
export function searchForTag(tag: string): void {
  useUiStore.getState().focusSearch(`tag:${tag}`);
}

/** Mod+Shift+D: open (or create) today's daily note. */
export async function openDailyNote(): Promise<void> {
  await useVaultStore.getState().openDailyNote();
}

/** Mod+W: close the active tab of the focused pane. */
export function closeActiveTab(): void {
  const ws = useWorkspaceStore.getState();
  const focused = ws.layout.panes.find((p) => p.id === ws.layout.focused);
  if (focused?.active) ws.close(focused.active);
}

/** Mod+PageDown / Mod+PageUp: next or previous tab of the focused pane (wraps around). */
export function cycleTab(delta: 1 | -1): void {
  const ws = useWorkspaceStore.getState();
  const focused = ws.layout.panes.find((p) => p.id === ws.layout.focused);
  if (!focused || focused.tabs.length === 0) return;
  const idx = focused.active === null ? -1 : focused.tabs.indexOf(focused.active);
  const next = (idx + delta + focused.tabs.length) % focused.tabs.length;
  const path = focused.tabs[next];
  if (path !== undefined) ws.activate(focused.id, path);
}

/** Mod+\: open the active note in a second pane, or close the split again. */
export function toggleSplit(): void {
  const ws = useWorkspaceStore.getState();
  if (ws.layout.panes.some((p) => p.id === "secondary")) {
    ws.unsplit();
    return;
  }
  const focused = ws.layout.panes.find((p) => p.id === ws.layout.focused);
  if (!focused || focused.active === null || focused.tabs.length < 2) {
    useUiStore.getState().toast("Open another note first, then split the view.");
    return;
  }
  ws.moveToPane(focused.active, "secondary");
}

/** Opens a note in the second pane (creating the split when needed). */
export async function openInSplit(path: string): Promise<void> {
  try {
    await flushPendingWrites();
  } catch (e) {
    reportError(e);
  }
  useWorkspaceStore.getState().open(path, "secondary");
}
