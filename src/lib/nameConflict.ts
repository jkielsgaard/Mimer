import type { Project } from "@/bindings/Project";
import type { TreeNode } from "@/bindings/TreeNode";
import { basename } from "@/lib/utils";

/** What an existing entry is called in messages. */
export type SiblingKind = "note" | "folder" | "project" | "file";

export interface Sibling {
  /** The name as shown in the tree (a note without `.md`). */
  name: string;
  kind: SiblingKind;
}

/** Characters a file or folder name cannot contain. */
const BAD_CHARS = /[\\/:*?"<>|]/;

/** The name an entry is shown with in the tree, lower-cased for comparing (as the backend does). */
function key(name: string, isDir: boolean): string {
  const lower = name.toLowerCase();
  return !isDir && lower.endsWith(".md") ? lower.slice(0, -3) : lower;
}

/** Entries directly inside `folder` (`""` is the vault root). */
export function childrenOf(tree: readonly TreeNode[], folder: string): readonly TreeNode[] {
  if (folder === "") return tree;
  let level: readonly TreeNode[] = tree;
  let found: TreeNode | undefined;
  for (const part of folder.split("/")) {
    found = level.find((n) => n.isDir && n.name === part);
    if (!found) return [];
    level = found.children;
  }
  return found?.children ?? [];
}

/**
 * The entry in `folder` that would look the same as a new entry called `name` in the tree: the
 * same name ignoring upper/lower case, and a note counts without its `.md` (so a note `Work` and
 * a folder `Work` collide). `exceptPath` is an entry that is not counted (the one being renamed,
 * which may change only the case of its own name).
 */
export function findLookalike(
  tree: readonly TreeNode[],
  projects: readonly Project[],
  folder: string,
  name: string,
  isDir: boolean,
  exceptPath?: string,
): Sibling | null {
  const wanted = key(name.trim(), isDir);
  for (const n of childrenOf(tree, folder)) {
    if (n.path === exceptPath || key(n.name, n.isDir) !== wanted) continue;
    const shown = n.isDir || !n.name.toLowerCase().endsWith(".md") ? n.name : n.name.slice(0, -3);
    const kind: SiblingKind = n.isDir
      ? projects.some((p) => p.folder === n.path)
        ? "project"
        : "folder"
      : n.name.toLowerCase().endsWith(".md")
        ? "note"
        : "file";
    return { name: shown, kind };
  }
  return null;
}

/** The sentence that says where the name is taken. */
export function takenMessage(s: Sibling, folder: string): string {
  const place = folder === "" ? "the vault root" : `“${basename(folder)}”`;
  return `A ${s.kind} called “${s.name}” already exists in ${place}.`;
}

/**
 * Why `name` cannot be used for a new entry in `folder`, or null when it can: empty, characters
 * that are not allowed, or a name that is already taken. The text is meant to be shown next to
 * the field.
 */
export function nameError(
  tree: readonly TreeNode[],
  projects: readonly Project[],
  folder: string,
  name: string,
  isDir: boolean,
  exceptPath?: string,
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Enter a name.";
  if (BAD_CHARS.test(trimmed)) return 'A name cannot contain \\ / : * ? " < > |';
  if (trimmed.startsWith(".")) return "A name cannot start with a dot.";
  const taken = findLookalike(tree, projects, folder, trimmed, isDir, exceptPath);
  return taken ? `${takenMessage(taken, folder)} Choose another name.` : null;
}

/** Why a project cannot be called `name` (another project already has it), or null. */
export function projectNameError(
  projects: readonly Project[],
  name: string,
  exceptId?: string,
): string | null {
  const wanted = name.trim().toLowerCase();
  const other = projects.find((p) => p.id !== exceptId && p.name.trim().toLowerCase() === wanted);
  return other
    ? `A project called “${other.name}” already exists (folder ${other.folder}). Choose another name.`
    : null;
}
