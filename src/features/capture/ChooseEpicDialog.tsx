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
import { useTaskStore } from "@/stores/taskStore";

const NEW_EPIC = "::new";

/**
 * Asks which epic a task goes into (or the name of a new one), so no task is put in an epic
 * nobody chose. `onChoose` gets the path of the epic's note.
 */
export function ChooseEpicDialog({
  title,
  onChoose,
  onCancel,
}: {
  title: string;
  onChoose: (epicPath: string) => void;
  onCancel: () => void;
}) {
  const epics = useTaskStore((s) => s.epics);
  const [epic, setEpic] = useState<string | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    if (!useTaskStore.getState().loaded) void useTaskStore.getState().load();
  }, []);
  const chosen = epic ?? epics[0]?.path ?? NEW_EPIC;
  const ready = chosen !== NEW_EPIC || name.trim() !== "";

  const go = async (): Promise<void> => {
    if (!ready) return;
    const path =
      chosen === NEW_EPIC ? await useTaskStore.getState().createEpic(name.trim(), false) : chosen;
    if (path !== null) onChoose(path);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose the epic the task goes into.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <select
            aria-label="Epic for the task"
            value={chosen}
            className="rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => {
              setEpic(e.target.value);
            }}
          >
            {epics.map((e) => (
              <option key={e.path} value={e.path}>
                {e.title}
              </option>
            ))}
            <option value={NEW_EPIC}>+ New epic…</option>
          </select>
          {chosen === NEW_EPIC && (
            <Input
              autoFocus
              aria-label="Name of the new epic"
              placeholder="Name of the new epic"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              Make the task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
