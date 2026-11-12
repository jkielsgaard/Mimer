import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { askNextStep, setAskNextStep } from "@/lib/focusTime";
import { isOpen, leftOffLine } from "@/lib/taskLogic";
import { findTask, useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import type { Task } from "@/bindings/Task";

/**
 * When Focus is left, asks "What is the next step?" for the task that was worked on. One line, and
 * it can be skipped. The answer is written in the task's log as "Left off: …", and shows on the
 * task's page and on the start page the next time you come back.
 */
export function LeftOffPrompt() {
  const focusOpen = useUiStore((s) => s.focusOpen);
  const was = useRef(false);
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    if (focusOpen) {
      was.current = true;
      return;
    }
    if (!was.current) return;
    was.current = false;
    if (!askNextStep()) return;
    const { tasks, selected } = useTaskStore.getState();
    const t = findTask(tasks, selected);
    if (t !== null && isOpen(t)) setTask(t);
  }, [focusOpen]);

  if (task === null) return null;
  return (
    <Ask
      task={task}
      onDone={() => {
        setTask(null);
      }}
    />
  );
}

function Ask({ task, onDone }: { task: Task; onDone: () => void }) {
  const [text, setText] = useState("");
  const [never, setNever] = useState(false);

  const finish = (save: boolean): void => {
    if (never) setAskNextStep(false);
    if (save && text.trim() !== "") {
      // The task may have moved in its note since: look it up again.
      const { tasks } = useTaskStore.getState();
      const now = findTask(tasks, { path: task.path, line: task.line, title: task.title }) ?? task;
      void useTaskStore.getState().addLog(now, leftOffLine(text));
    }
    onDone();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>What is the next step?</DialogTitle>
          <DialogDescription>
            You are leaving “{task.title}”. One line is enough; you will see it when you come back.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
        >
          <label htmlFor="left-off" className="text-xs text-muted-foreground">
            Next step (optional)
          </label>
          <Input
            id="left-off"
            autoFocus
            maxLength={200}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={never}
              onChange={(e) => {
                setNever(e.target.checked);
              }}
            />
            Do not ask me again (Settings → General turns it on again)
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                finish(false);
              }}
            >
              Skip
            </Button>
            <Button type="submit" disabled={text.trim() === ""}>
              Save and leave
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
