import { FileText, Link2, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Task } from "@/bindings/Task";
import { LinkNoteDialog } from "@/features/editor/LinkNoteDialog";
import { allFolders } from "@/features/fileTree/treeUtils";
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
import { Select } from "@/components/ui/select";
import { inEpicFolder } from "@/lib/taskLogic";
import { dirname } from "@/lib/utils";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";
import { PlainButton } from "@/components/ui/plain-button";

/** The note a task points at, if it exists: its path. */
function useLinkedPath(task: Task): string | null {
  const resolver = useVaultStore((s) => s.resolver);
  return task.link === null ? null : resolver.resolve(task.link);
}

/** The name shown for a link target: the last part, without `.md`. */
function shownName(link: string): string {
  return (link.split("/").pop() ?? link).replace(/\.md$/i, "");
}

/**
 * A small chip with the name of the note a task points at. A click opens the note; when the note
 * is gone it is dimmed and a click opens the task, where the note can be made again.
 */
export function TaskNoteChip({ task }: { task: Task }) {
  const path = useLinkedPath(task);
  if (task.link === null) return null;
  const name = shownName(task.link);
  return (
    <PlainButton
      type="button"
      aria-label={path === null ? `Note missing: ${name}` : `Open the note ${name}`}
      title={
        path === null ? "The note is missing. Open the task to make it again." : `Open ${name}`
      }
      className={
        path === null
          ? "inline-flex max-w-40 shrink-0 items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          : "inline-flex max-w-40 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-accent px-2 text-xs font-semibold text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
      }
      onClick={(e) => {
        e.stopPropagation();
        if (path === null) useTaskStore.getState().open(task);
        else void useVaultStore.getState().openNote(path);
      }}
    >
      <FileText className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{path === null ? "Note missing" : name}</span>
    </PlainButton>
  );
}

/** The window behind "Make a note for this task". */
function MakeNoteDialog({
  task,
  name: first,
  open,
  onClose,
}: {
  task: Task;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const tree = useVaultStore((s) => s.tree);
  const newNoteFolder = useVaultStore((s) => s.vault?.config.newNoteFolder) ?? "";
  const [name, setName] = useState(first);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const folders = useMemo(() => allFolders(tree), [tree]);

  useEffect(() => {
    if (!open) return;
    setName(first);
    // The folder of the note the task is in; a task in an epic note uses the folder for new notes.
    setFolder(inEpicFolder(task.path) ? newNoteFolder : dirname(task.path));
  }, [open, first, task.path, newNoteFolder]);

  const make = (): void => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    void useTaskStore
      .getState()
      .makeNote(task, { name: trimmed, folder, template: null })
      .then((path) => {
        setBusy(false);
        if (path !== null) onClose();
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Make a note for “{task.title}”
          </DialogTitle>
          <DialogDescription className="text-xs">
            The task gets a link to the note, and the note gets a line that points back.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") make();
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Save it in
          <Select
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value);
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={name.trim() === "" || busy} onClick={make}>
            Make the note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Linked note" part of the task page: link a note you have, make a new one, or open, change
 * and unlink the one the task points at. Unlinking only takes the link off the task.
 */
export function LinkedNote({ task }: { task: Task }) {
  const path = useLinkedPath(task);
  const [picking, setPicking] = useState(false);
  const [making, setMaking] = useState(false);
  const name = task.link === null ? "" : shownName(task.link);
  return (
    <section aria-label="Linked note" className="flex flex-col gap-2">
      <h3 className="section-label">Linked note</h3>
      {task.link === null ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPicking(true);
              }}
            >
              <Link2 /> Link a note…
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setMaking(true);
              }}
            >
              <Plus /> Make a note for this task
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick a note you already have, or make a new one.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              path === null
                ? "inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground"
                : "inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
            }
          >
            <FileText className="size-4" aria-hidden />
            {name}
            {path === null && <span className="text-xs font-normal">· Note missing</span>}
          </span>
          {path !== null ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void useVaultStore.getState().openNote(path);
              }}
            >
              Open
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMaking(true);
              }}
            >
              Make the note
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Change the linked note"
            onClick={() => {
              setPicking(true);
            }}
          >
            <Pencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Unlink the note"
            title="Takes the link off the task. The note stays."
            onClick={() => {
              void useTaskStore.getState().setLink(task, null);
            }}
          >
            <X />
          </Button>
        </div>
      )}
      <LinkNoteDialog
        open={picking}
        initialQuery=""
        onPick={(target) => {
          void useTaskStore.getState().setLink(task, target);
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
      <MakeNoteDialog
        task={task}
        name={name === "" ? task.title : name}
        open={making}
        onClose={() => {
          setMaking(false);
        }}
      />
    </section>
  );
}
