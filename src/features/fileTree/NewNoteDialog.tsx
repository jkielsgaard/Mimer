import { useMemo } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { findLookalike, nameError } from "@/lib/nameConflict";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * The one way to make a new note: ask for its name, then create it with that name as its first
 * heading. Mod+N, New → Note and the tree menus all open this dialog. A name that is already
 * taken in the folder is explained while typing.
 */
export function NewNoteDialog() {
  const target = useUiStore((s) => s.newNoteDialog);
  const close = (): void => {
    useUiStore.getState().openNewNoteDialog(null);
  };
  const tree = useVaultStore((s) => s.tree);
  const projects = useVaultStore((s) => s.projects);
  const folder = target?.folder ?? "";

  /** "Untitled", or "Untitled 1", … when that name is taken. */
  const suggestion = useMemo(() => {
    let name = "Untitled";
    for (let i = 1; findLookalike(tree, projects, folder, name, false) !== null; i++) {
      name = `Untitled ${String(i)}`;
    }
    return name;
  }, [tree, projects, folder]);

  return (
    <PromptDialog
      open={target !== null}
      title="New note"
      label={folder === "" ? "Name (in the vault root)" : `Name (in ${folder})`}
      confirmLabel="Create"
      initialValue={suggestion}
      validate={(v) => nameError(tree, projects, folder, v, false)}
      onCancel={close}
      onSubmit={(name) => {
        close();
        void useVaultStore
          .getState()
          .createNote(folder, name.trim(), true)
          .then(() => {
            if (folder !== "") useTreeStore.getState().expand(folder);
          });
      }}
    />
  );
}
