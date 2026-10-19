import { noteTitle } from "@/lib/utils";

/** What a tab shows: the note's name, and where it is when another open tab has the same name. */
export interface TabLabel {
  title: string;
  /** The folder that tells equally named tabs apart, or null when the name is enough. */
  hint: string | null;
}

/** The last `n` folders of a note's path, as `Acme` or `Work/Acme`. */
function folderTail(path: string, n: number): string {
  const folders = path.split("/").slice(0, -1);
  return folders.slice(-n).join("/");
}

/**
 * Labels for open tabs. Two notes called "Meeting" in different folders would look the same, so
 * they also show their folder: the shortest end of the folder path that tells them apart.
 */
export function tabLabels(paths: readonly string[]): Map<string, TabLabel> {
  const out = new Map<string, TabLabel>();
  const byTitle = new Map<string, string[]>();
  for (const p of paths) {
    const key = noteTitle(p).toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), p]);
  }
  for (const group of byTitle.values()) {
    if (group.length === 1) {
      for (const p of group) out.set(p, { title: noteTitle(p), hint: null });
      continue;
    }
    const deepest = Math.max(...group.map((p) => p.split("/").length - 1), 1);
    let depth = 1;
    // Show one more folder until every tab in the group has its own text.
    while (depth < deepest) {
      const seen = new Set(group.map((p) => folderTail(p, depth)));
      if (seen.size === group.length) break;
      depth += 1;
    }
    for (const p of group) {
      out.set(p, { title: noteTitle(p), hint: folderTail(p, depth) || "Vault" });
    }
  }
  return out;
}
