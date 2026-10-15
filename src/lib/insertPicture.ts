import { getActiveEditor } from "@/lib/activeEditor";
import { linkForDroppedPath } from "@/lib/dropLink";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * Inserts a picture that is already in the vault at the cursor of the note being edited, written
 * the way the vault writes images. Returns false (with a hint) when no note is ready for it.
 */
export function insertPictureIntoNote(picturePath: string): boolean {
  const target = getActiveEditor();
  const vault = useVaultStore.getState();
  const text =
    target === null
      ? null
      : linkForDroppedPath(
          picturePath,
          target.notePath,
          vault.files,
          vault.vault?.config.imageLinkStyle === "wiki" ? "wiki" : "markdown",
          (p) => vault.resolver.shortestForm(p),
        );
  if (target === null || text === null) {
    useUiStore.getState().toast("Click in a note where the picture should go, then try again.");
    return false;
  }
  const sel = target.view.state.selection.main;
  target.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
  });
  target.view.focus();
  return true;
}
