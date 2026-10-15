import { basename, dirname, isInside, joinPath } from "@/lib/utils";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { placeNames, stepName, topLevelPaths, visibleNames } from "./treeUtils";

/** The paths carried by a drag: all ticked items, or the single item. */
export function droppedPaths(data: DataTransfer): string[] {
  const many = data.getData("application/x-mimer-paths");
  if (many !== "") {
    try {
      const parsed: unknown = JSON.parse(many);
      if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === "string");
    } catch {
      /* fall through to the single path */
    }
  }
  const one = data.getData("application/x-mimer-path");
  return one === "" ? [] : [one];
}

/** Moves several items into `folder`. Links are updated without asking for each one. */
export async function moveMany(paths: readonly string[], folder: string): Promise<number> {
  const items = topLevelPaths(paths);
  let moved = 0;
  for (const p of items) {
    if (await moveInto(p, folder, items.length > 1 ? true : undefined)) moved++;
  }
  useTreeStore.getState().clearMulti();
  if (items.length > 1 && moved > 0) {
    useUiStore.getState().toast(`Moved ${String(moved)} items`, "success");
  }
  return moved;
}

/** Moves `from` into `folder`, unless it is a project (a project stays in the vault root). */
export async function moveInto(
  from: string,
  folder: string,
  updateLinks?: boolean,
): Promise<boolean> {
  const to = joinPath(folder, basename(from));
  if (from === to || isInside(folder, from)) return false;
  // A project always stays in the vault root: it can be renamed, but never moved into a folder.
  if (folder !== "" && useVaultStore.getState().projects.some((p) => p.folder === from)) {
    useUiStore.getState().showNotice({
      title: "A project stays in the vault root",
      details: [`“${basename(from)}” is a project, so it cannot be moved into a folder.`],
      hint: "Drop notes and folders into the project instead.",
    });
    return false;
  }
  if (!(await useVaultStore.getState().renamePath(from, to, updateLinks))) return false;
  useTreeStore.getState().expandAncestors(to);
  return true;
}

/**
 * Puts the dropped items next to `target` in the user's own order. Items from another folder are
 * moved into the target's folder first.
 */
export async function moveBeside(
  paths: readonly string[],
  target: string,
  where: "before" | "after",
): Promise<void> {
  const folder = dirname(target);
  const items = topLevelPaths(paths).filter((p) => p !== target && !isInside(folder, p));
  for (const p of items) {
    if (
      dirname(p) !== folder &&
      !(await moveInto(p, folder, items.length > 1 ? true : undefined))
    ) {
      return;
    }
  }
  const tree = useTreeStore.getState();
  const names = visibleNames(useVaultStore.getState().tree, tree.order, folder);
  const moving = items.map(basename);
  tree.clearMulti();
  await tree.setFolderOrder(folder, placeNames(names, moving, basename(target), where));
}

/** Moves one item a place up (`-1`) or down (`1`) in its folder. */
export async function moveStep(path: string, delta: number): Promise<void> {
  const folder = dirname(path);
  const tree = useTreeStore.getState();
  const names = visibleNames(useVaultStore.getState().tree, tree.order, folder);
  await tree.setFolderOrder(folder, stepName(names, basename(path), delta));
}
