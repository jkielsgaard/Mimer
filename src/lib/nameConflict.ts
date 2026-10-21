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

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Why a single name cannot be used on Windows and OneDrive (the same rules as the backend), or
 * null when it can. The text says why, because it is shown in a red box next to the field.
 */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Enter a name.";
  if (BAD_CHARS.test(trimmed))
    return 'A name cannot contain \\ / : * ? " < > | because Windows cannot store them.';
  if (trimmed.startsWith("."))
    return "A name cannot start with a dot, because such names are hidden.";
  if (trimmed.endsWith("."))
    return "A name cannot end with a dot. Windows and OneDrive remove it or refuse the folder, and then the notes cannot be opened.";
  const stem = (trimmed.split(".")[0] ?? "").trimEnd();
  if (RESERVED.test(stem))
    return `“${stem}” is a name Windows keeps for itself, so it cannot be used.`;
  return null;
}

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
  const problem = nameProblem(trimmed);
  if (problem !== null) return problem;
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
