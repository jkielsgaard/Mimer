import type { TreeNode } from "@/bindings/TreeNode";
import { isImage, isMarkdown } from "@/lib/utils";

export type Action =
  | { kind: "newNote"; folder: string }
  | { kind: "newFolder"; folder: string }
  | { kind: "rename"; node: TreeNode }
  | { kind: "delete"; node: TreeNode }
  | { kind: "deleteMany"; paths: string[] }
  | { kind: "moveMany"; paths: string[] };

export function displayName(n: TreeNode): string {
  return n.isDir ? n.name : isMarkdown(n.name) ? n.name.replace(/\.md$/i, "") : n.name;
}

export interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: ReadonlySet<string>;
  toggle: (path: string) => void;
  projectFolders: readonly string[];
  /** Show every folder open (while the filter is used). */
  forceOpen: boolean;
  onAction: (a: Action) => void;
  onDropOn: (folder: string, e: React.DragEvent) => void;
}

/** `manual` follows the order the user chose (see `TreeOrder`); the others sort by name or date. */
export type SortMode = "name" | "modified" | "manual";

/** The user's chosen order: folder path ("" = the root) → names. */
export type OrderMap = Readonly<Record<string, readonly string[]>>;

/** Number of notes (`.md` files) in a folder, including its sub-folders. */
export function countNotes(node: TreeNode): number {
  if (!node.isDir) return isMarkdown(node.name) ? 1 : 0;
  return node.children.reduce((sum, c) => sum + countNotes(c), 0);
}

/**
 * Sorts a tree: folders first, by name; files by name or, newest first, by last change.
 * In `manual` mode the names listed for a folder in `order` come first, in that order, folders
 * and files mixed; anything not listed (new files) follows, folders first, by name.
 * `parent` is the folder the top level of `nodes` lives in.
 */
export function sortTree(
  nodes: readonly TreeNode[],
  mode: SortMode,
  order: OrderMap = {},
  parent = "",
): TreeNode[] {
  const byName = (a: TreeNode, b: TreeNode): number =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  const listed = mode === "manual" ? (order[parent] ?? []) : [];
  const rank = (n: TreeNode): number => {
    const i = listed.indexOf(n.name);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return nodes
    .map((n) => (n.isDir ? { ...n, children: sortTree(n.children, mode, order, n.path) } : n))
    .sort((a, b) => {
      if (mode === "manual" && rank(a) !== rank(b)) return rank(a) < rank(b) ? -1 : 1;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (!a.isDir && mode === "modified" && a.modified !== b.modified) {
        return b.modified - a.modified;
      }
      return byName(a, b);
    });
}

/**
 * The part of a tree that matches `query` (name, without regard to case): a matching file, a
 * folder with a matching name (kept whole), or a folder with a matching file somewhere inside.
 */
export function filterTree(nodes: readonly TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...nodes];
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.name.toLowerCase().includes(q)) {
      out.push(n);
    } else if (n.isDir) {
      const inside = filterTree(n.children, q);
      if (inside.length > 0) out.push({ ...n, children: inside });
    }
  }
  return out;
}

/** The folders above a path, outermost first: `A/B/c.md` → `["A", "A/B"]`. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Folders that contain at least one note, with the number of notes in each (sub-folders included). */
export function folderNoteCounts(nodes: readonly TreeNode[]): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (list: readonly TreeNode[]): void => {
    for (const n of list) {
      if (!n.isDir) continue;
      const count = countNotes(n);
      if (count > 0) out.set(n.path, count);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Notes Mimer keeps for itself in the vault root. They are not shown in the file tree. */
export const MANAGED_NOTES: readonly string[] = ["Ideas.md"];

/** Whether a path is one of the notes Mimer keeps for itself (Tasks and Ideas). */
export function isManagedNote(path: string): boolean {
  return MANAGED_NOTES.includes(path);
}

/** The folder the epics are kept in. */
export const EPICS_FOLDER = "Tasks";

/** The top-level folders that are shown in the Landing section, in the order they are given. */
export function landingNodes(tree: readonly TreeNode[], folders: readonly string[]): TreeNode[] {
  return folders
    .map((f) => tree.find((n) => n.isDir && n.path === f))
    .filter((n): n is TreeNode => n !== undefined);
}

/** Every note (not folders) inside the given nodes, newest first. */
export function newNotesIn(nodes: readonly TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: readonly TreeNode[]): void => {
    for (const n of list) {
      if (n.isDir) walk(n.children);
      else if (isMarkdown(n.path)) out.push(n);
    }
  };
  walk(nodes);
  return out.sort((a, b) => b.modified - a.modified);
}

/** The tree without the notes Mimer manages itself (only in the root of the vault). */
export function withoutManagedNotes(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.filter((n) => n.isDir || !MANAGED_NOTES.includes(n.path));
}

/** The tree without the folders in `folders` (used to take the projects out of "All files"). */
export function withoutFolders(nodes: readonly TreeNode[], folders: readonly string[]): TreeNode[] {
  return nodes
    .filter((n) => !(n.isDir && folders.includes(n.path)))
    .map((n) => (n.isDir ? { ...n, children: withoutFolders(n.children, folders) } : n));
}

/**
 * The tree without picture files, and without folders that only held pictures. Pictures are
 * listed in the Images tab, so they are not shown a second time among the notes (for example the
 * pictures that came with an import). A folder that was already empty stays.
 */
export function withoutImages(nodes: readonly TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (!n.isDir) {
      if (!isImage(n.name)) out.push(n);
      continue;
    }
    const children = withoutImages(n.children);
    if (children.length === 0 && n.children.length > 0) continue;
    out.push({ ...n, children });
  }
  return out;
}

/** The folder node at `path`, searched through the whole tree. */
export function findFolder(nodes: readonly TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (!n.isDir) continue;
    if (n.path === path) return n;
    const inside = findFolder(n.children, path);
    if (inside) return inside;
  }
  return null;
}

/** Moves the top-level folders named in `pinned` to the top, in that order. */
export function pinFirst(nodes: readonly TreeNode[], pinned: readonly string[]): TreeNode[] {
  const top = pinned
    .map((p) => nodes.find((n) => n.isDir && n.path === p))
    .filter((n): n is TreeNode => n !== undefined);
  return [...top, ...nodes.filter((n) => !top.includes(n))];
}

/** The paths that are not inside another path of the list (moving a folder moves what is in it). */
export function topLevelPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => !paths.some((o) => o !== p && p.startsWith(`${o}/`)));
}

/** Every folder in the tree as a path, outermost first. */
export function allFolders(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.isDir ? [n.path, ...allFolders(n.children)] : []));
}

/** `moving` placed next to `target` in `names` (the folder's names as shown now). */
export function placeNames(
  names: readonly string[],
  moving: readonly string[],
  target: string,
  where: "before" | "after",
): string[] {
  const rest = names.filter((n) => !moving.includes(n));
  const at = rest.indexOf(target);
  if (at < 0) return [...rest, ...moving];
  rest.splice(where === "before" ? at : at + 1, 0, ...moving);
  return rest;
}

/** One name moved `delta` places up (negative) or down (positive) among `names`. */
export function stepName(names: readonly string[], name: string, delta: number): string[] {
  const from = names.indexOf(name);
  if (from < 0) return [...names];
  const to = Math.min(names.length - 1, Math.max(0, from + delta));
  const out = [...names];
  out.splice(from, 1);
  out.splice(to, 0, name);
  return out;
}

/** The names in `folder` as the tree shows them in manual order. */
export function visibleNames(tree: readonly TreeNode[], order: OrderMap, folder: string): string[] {
  const children = folder === "" ? tree : (findFolder(tree, folder)?.children ?? []);
  return sortTree(children, "manual", order, folder).map((n) => n.name);
}
