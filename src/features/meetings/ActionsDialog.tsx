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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { findActions, markActionsAdded } from "@/lib/meeting";
import { epicGroups } from "@/lib/taskLogic";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";

/** The epic task that belongs to the meeting's own note. */
const THIS_MEETING = "__meeting__";

/**
 * "Add actions to Tasks": the lines marked Action in a meeting, with a tick on each that is not in
 * the tasks yet, and the epic task they go into. Added lines are marked "(in Tasks)" in the note,
 * so they are not added twice. No AI is used.
 */
export function ActionsDialog({
  path,
  content,
  onDone,
  onClose,
}: {
  /** The meeting's note. */
  path: string;
  /** The text of the note now. */
  content: string;
  /** Called with the note's new text (the added lines marked) so the caller can save it. */
  onDone: (next: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const epicOrder = useTaskStore((s) => s.epicOrder);
  const actions = useMemo(() => findActions(content), [content]);
  const [chosen, setChosen] = useState<Set<number>>(
    () => new Set(actions.filter((a) => !a.added).map((a) => a.line)),
  );
  const [into, setInto] = useState(THIS_MEETING);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const groups = useMemo(
    () => epicGroups(tasks, epics, epicOrder).filter((g) => !g.allDone),
    [tasks, epics, epicOrder],
  );
  const count = actions.filter((a) => chosen.has(a.line)).length;

  const add = async (): Promise<void> => {
    setBusy(true);
    try {
      const store = useTaskStore.getState();
      const epic = into === THIS_MEETING ? await store.epicFor(path) : into;
      if (epic === null) {
        useUiStore.getState().toast("The epic task could not be made.", "error");
        setBusy(false);
        return;
      }
      const lines: number[] = [];
      for (const a of actions) {
        if (!chosen.has(a.line)) continue;
        await store.add(a.text, undefined, undefined, epic);
        lines.push(a.line);
      }
      await onDone(markActionsAdded(content, lines));
      useUiStore
        .getState()
        .toast(
          `Added ${String(lines.length)} ${lines.length === 1 ? "task" : "tasks"}.`,
          "success",
        );
      onClose();
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add actions to Tasks</DialogTitle>
          <DialogDescription>
            The lines marked Action in this meeting. Lines already in Tasks are marked and left out.
          </DialogDescription>
        </DialogHeader>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no lines marked Action yet. In the meeting, press <b>Action</b> and write what
            someone is going to do.
          </p>
        ) : (
          <ul aria-label="Actions" className="flex max-h-72 flex-col overflow-auto">
            {actions.map((a) => (
              <li key={a.line} className="flex items-center gap-2.5 border-t py-1.5 text-sm">
                <input
                  type="checkbox"
                  id={`action-${String(a.line)}`}
                  disabled={a.added}
                  checked={chosen.has(a.line)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(a.line);
                    else next.delete(a.line);
                    setChosen(next);
                  }}
                />
                <label
                  htmlFor={`action-${String(a.line)}`}
                  className={a.added ? "flex-1 text-muted-foreground" : "flex-1"}
                >
                  {a.text}
                  {a.added && " · in Tasks"}
                </label>
                {a.item !== "" && <span className="text-xs text-muted-foreground">{a.item}</span>}
              </li>
            ))}
          </ul>
        )}
        {actions.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="actions-into">Goes into the epic task</Label>
            <Select
              id="actions-into"
              value={into}
              onChange={(e) => {
                setInto(e.target.value);
              }}
            >
              <option value={THIS_MEETING}>This meeting</option>
              {groups.map((g) => (
                <option key={g.path} value={g.path}>
                  {g.title}
                </option>
              ))}
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || count === 0}
            onClick={() => {
              void add();
            }}
          >
            Add {count} to Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
