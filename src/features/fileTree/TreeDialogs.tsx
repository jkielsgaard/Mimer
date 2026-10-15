import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { nameError } from "@/lib/nameConflict";
import { dirname, isMarkdown, joinPath } from "@/lib/utils";
import { useTreeStore } from "@/stores/treeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { reportError, useUiStore } from "@/stores/uiStore";
import { moveMany } from "./treeMoves";
import { allFolders, displayName, type Action } from "./treeUtils";

/** Choose a folder and move several items into it. */
function MoveManyDialog({ paths, close }: { paths: string[] | null; close: () => void }) {
  const tree = useVaultStore((s) => s.tree);
  const [target, setTarget] = useState("");
  const items = paths ?? [];
  const folders = allFolders(tree).filter(
    (f) => !items.some((p) => f === p || f.startsWith(`${p}/`)),
  );
  return (
    <Dialog
      open={paths !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Move {items.length} items</DialogTitle>
          <DialogDescription className="text-xs">
            Links to the moved notes are updated. Everything stays in the version history.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Move to
          <Select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
            }}
          >
            <option value="">(vault root)</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              close();
              void moveMany(items, target).catch(reportError);
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  action: Action | null;
  close: () => void;
}

/** The dialogs behind the tree's menus: new note, new folder, rename and delete. */
export function TreeDialogs({ action, close }: Props) {
  const tree = useVaultStore((s) => s.tree);
  const projects = useVaultStore((s) => s.projects);
  // "New note" in the tree's menus uses the same name dialog as Mod+N and New → Note.
  useEffect(() => {
    if (action?.kind !== "newNote") return;
    useUiStore.getState().openNewNoteDialog(action.folder);
    close();
  }, [action, close]);
  return (
    <>
      <PromptDialog
        open={action?.kind === "newFolder"}
        title="New folder"
        label="Name"
        confirmLabel="Create"
        validate={(v) =>
          nameError(tree, projects, action?.kind === "newFolder" ? action.folder : "", v, true)
        }
        onCancel={close}
        onSubmit={(name) => {
          if (action?.kind !== "newFolder") return;
          const folder = action.folder;
          close();
          void useVaultStore
            .getState()
            .createFolder(folder, name.trim())
            .then(() => {
              if (folder !== "") useTreeStore.getState().expand(folder);
            });
        }}
      />
      <PromptDialog
        open={action?.kind === "rename"}
        title="Rename"
        label="New name"
        confirmLabel="Rename"
        initialValue={action?.kind === "rename" ? displayName(action.node) : ""}
        validate={(v) =>
          action?.kind === "rename"
            ? nameError(
                tree,
                projects,
                dirname(action.node.path),
                v,
                action.node.isDir,
                action.node.path,
              )
            : null
        }
        onCancel={close}
        onSubmit={(name) => {
          if (action?.kind !== "rename") return;
          const node = action.node;
          close();
          const trimmed = name.trim();
          const newName =
            !node.isDir && isMarkdown(node.name) && !isMarkdown(trimmed)
              ? `${trimmed}.md`
              : trimmed;
          void useVaultStore
            .getState()
            .renamePath(node.path, joinPath(dirname(node.path), newName));
        }}
      />
      <MoveManyDialog paths={action?.kind === "moveMany" ? action.paths : null} close={close} />
      <ConfirmDialog
        open={action?.kind === "deleteMany"}
        title={
          action?.kind === "deleteMany" ? `Delete ${String(action.paths.length)} items?` : "Delete"
        }
        description="They are removed from your vault but stay in the version history. You can bring them back with File → Recover deleted notes."
        confirmLabel="Delete"
        destructive
        onCancel={close}
        onConfirm={() => {
          if (action?.kind !== "deleteMany") return;
          const paths = action.paths;
          close();
          void (async () => {
            let deleted = 0;
            for (const p of paths) if (await useVaultStore.getState().deletePath(p)) deleted++;
            useTreeStore.getState().clearMulti();
            useUiStore.getState().toast(`Deleted ${String(deleted)} items`, "success");
          })();
        }}
      />
      <ConfirmDialog
        open={action?.kind === "delete"}
        title={action?.kind === "delete" ? `Delete “${displayName(action.node)}”?` : "Delete"}
        description="It is removed from your vault but stays in the version history. You can bring it back with File → Recover deleted notes."
        confirmLabel="Delete"
        destructive
        onCancel={close}
        onConfirm={() => {
          if (action?.kind !== "delete") return;
          const path = action.node.path;
          close();
          void useVaultStore.getState().deletePath(path);
        }}
      />
    </>
  );
}
