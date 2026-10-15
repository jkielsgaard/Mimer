import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { freeNoteName, parseResearchAnswer } from "@/lib/researchAnswer";
import { reportError, useUiStore } from "@/stores/uiStore";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";

/**
 * File → Import an answer from a cloud AI: paste the answer to a research prompt, check the
 * warnings, save it as a note that is marked "needs review".
 */
export function ImportAnswerDialog() {
  const open = useUiStore((s) => s.importAnswerOpen);
  const setOpen = useUiStore((s) => s.setImportAnswerOpen);
  const files = useVaultStore((s) => s.files);
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRaw("");
    setTitle("");
    setBusy(false);
    setFolder(currentFolder(useVaultStore.getState()));
  }, [open]);

  const today = new Date().toISOString().slice(0, 10);
  const parsed = useMemo(
    () => (raw.trim() === "" ? null : parseResearchAnswer(raw, today)),
    [raw, today],
  );

  const parsedTitle = parsed?.title ?? "";
  useEffect(() => {
    if (parsedTitle !== "") setTitle(parsedTitle);
  }, [parsedTitle]);

  const save = async (): Promise<void> => {
    if (parsed === null || title.trim() === "") return;
    setBusy(true);
    try {
      const vault = useVaultStore.getState();
      const name = freeNoteName(title, folder, files);
      const path = await api.createNote(folder, name);
      const content = parsed.content.replace(/^title:.*$/m, `title: ${title.trim()}`);
      await api.writeNote(path, content);
      await vault.refreshTree();
      await vault.openNote(path);
      useUiStore.getState().toast("Answer saved as a note marked “needs review”", "success");
      setOpen(false);
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Import an answer from a cloud AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            Paste the whole answer to a research prompt. It is saved as a new note marked “needs
            review”; nothing existing is changed.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          aria-label="The answer"
          rows={10}
          className="font-mono text-xs"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
          }}
        />
        {parsed !== null && (
          <>
            {parsed.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning-foreground">
                {parsed.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
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
          </>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={parsed === null || title.trim() === "" || busy}
            onClick={() => void save()}
          >
            Save as note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
