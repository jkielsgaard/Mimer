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
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ravenNoteContent, suggestTitle } from "@/lib/ravenNote";
import { freeNoteName } from "@/lib/researchAnswer";
import { reportError, useUiStore } from "@/stores/uiStore";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";

/**
 * Saves an answer from Raven as a new note, marked "needs review" so it is clear that it came from
 * a cloud AI and has not been checked. Nothing existing is changed.
 */
export function SaveAnswerDialog({
  answer,
  onClose,
}: {
  /** The answer to save; `null` keeps the dialog closed. */
  answer: string | null;
  onClose: () => void;
}) {
  const files = useVaultStore((s) => s.files);
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (answer === null) return;
    setTitle(suggestTitle(answer));
    setFolder(currentFolder(useVaultStore.getState()));
    setBusy(false);
  }, [answer]);

  const save = async (): Promise<void> => {
    if (answer === null || title.trim() === "") return;
    setBusy(true);
    try {
      const vault = useVaultStore.getState();
      const name = freeNoteName(title, folder, files);
      const path = await api.createNote(folder, name);
      await api.writeNote(
        path,
        ravenNoteContent(title, answer, new Date().toISOString().slice(0, 10)),
      );
      await vault.refreshTree();
      await vault.openNote(path);
      useUiStore.getState().toast("Answer saved as a note marked “needs review”", "success");
      onClose();
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={answer !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Save the answer as a note</DialogTitle>
          <DialogDescription className="text-xs">
            It is saved as a new note marked “needs review”. Check the facts before you rely on it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Note title
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Folder
            <Input
              value={folder}
              placeholder="(vault root)"
              onChange={(e) => {
                setFolder(e.target.value);
              }}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={title.trim() === "" || busy}
            onClick={() => {
              void save();
            }}
          >
            Save as note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
