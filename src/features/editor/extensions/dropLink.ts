import { EditorView } from "@codemirror/view";
import { linkForDroppedPath } from "@/lib/dropLink";
import { useVaultStore } from "@/stores/vaultStore";

const MIME = "application/x-mimer-path";

/** Drop a note, picture or file from the file tree into the note to insert a link to it. */
export function dropLink(getNotePath: () => string | null) {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (!event.dataTransfer?.types.includes(MIME)) return false;
      event.preventDefault();
      return true;
    },
    drop(event, view) {
      const path = event.dataTransfer?.getData(MIME) ?? "";
      const notePath = getNotePath();
      if (path === "" || notePath === null) return false;
      const vault = useVaultStore.getState();
      const text = linkForDroppedPath(
        path,
        notePath,
        vault.files,
        vault.vault?.config.imageLinkStyle === "wiki" ? "wiki" : "markdown",
        (p) => vault.resolver.shortestForm(p),
      );
      if (text === null) return false;
      event.preventDefault();
      const at =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
      });
      view.focus();
      return true;
    },
  });
}
