import { api, toApiError } from "@/lib/api";
import { isMarkdown, noteTitle } from "@/lib/utils";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** The text of an index note: a link to every note in the folder, grouped by subfolder. */
export function linkIndexText(folder: string, files: readonly string[], title: string): string {
  const prefix = folder === "" ? "" : `${folder}/`;
  const notes = files
    .filter((f) => f.startsWith(prefix) && isMarkdown(f))
    .map((f) => f.slice(prefix.length))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const groups = new Map<string, string[]>();
  for (const rel of notes) {
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    groups.set(dir, [...(groups.get(dir) ?? []), rel]);
  }
  const link = (rel: string): string =>
    `- [[${prefix}${rel.replace(/\.md$/i, "")}|${noteTitle(rel)}]]`;
  const parts = [`# ${title}`, ""];
  for (const [dir, list] of groups) {
    if (dir !== "") parts.push(`## ${dir}`, "");
    parts.push(...list.map(link), "");
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

/**
 * Makes an index note in a folder that links to every note in it, and opens it. No AI is used, so
 * it works whether or not an AI is set up.
 */
export async function makeLinkIndex(folder: string): Promise<void> {
  const vault = useVaultStore.getState();
  const name = folder === "" ? "Index" : `${folder.split("/").pop() ?? folder} index`;
  const files = vault.files;
  try {
    let path: string | null = null;
    for (let i = 0; i < 20 && path === null; i++) {
      const candidate = i === 0 ? name : `${name} ${String(i)}`;
      try {
        path = await api.createNote(folder, candidate);
      } catch (e) {
        if (toApiError(e).code !== "AlreadyExists") throw e;
      }
    }
    if (path === null) return;
    const title = noteTitle(path);
    await api.writeNote(
      path,
      linkIndexText(
        folder,
        files.filter((f) => f !== path),
        title,
      ),
    );
    await vault.refreshTree();
    await vault.openNote(path);
  } catch (e) {
    reportError(e);
  }
}
