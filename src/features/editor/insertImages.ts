import type { EditorView } from "@codemirror/view";
import { api } from "@/lib/api";
import { pickImages } from "@/lib/dialogs";
import { imageMarkdown } from "@/lib/imageMarkdown";
import { basename, resolveRelativePath } from "@/lib/utils";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * The text for a picture that was saved in the vault, written the way the vault is set up to
 * write images. `link` is the path relative to the note that the backend returned.
 */
export async function savedImageText(notePath: string, link: string, alt: string): Promise<string> {
  const vault = useVaultStore.getState();
  await vault.refreshTree();
  const fresh = useVaultStore.getState();
  const vaultPath = resolveRelativePath(notePath, link);
  if (vaultPath === null) return `![${alt}](${link})`;
  const style = fresh.vault?.config.imageLinkStyle === "wiki" ? "wiki" : "markdown";
  return imageMarkdown(style, notePath, vaultPath, (p) => fresh.resolver.shortestForm(p), alt);
}

/** Lets the user choose pictures, copies them into the vault and inserts them at the cursor. */
export async function insertImagesFromDialog(view: EditorView, notePath: string): Promise<void> {
  try {
    const files = await pickImages();
    if (files.length === 0) return;
    const links = await api.addImages(notePath, files);
    const parts: string[] = [];
    for (const link of links) {
      const stem = basename(link.split("?")[0] ?? link)
        .replace(/%20/g, " ")
        .replace(/\.[^.]+$/, "");
      parts.push(await savedImageText(notePath, link, stem));
    }
    const sel = view.state.selection.main;
    const text = parts.join("\n");
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length },
    });
    view.focus();
  } catch (e) {
    reportError(e);
  }
}
