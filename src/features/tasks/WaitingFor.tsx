import { useEffect, useState } from "react";
import type { Task } from "@/bindings/Task";
import { Input } from "@/components/ui/input";
import { useTaskStore } from "@/stores/taskStore";

/**
 * Under the status Waiting: who or what the task waits for, in the person's own words
 * ("the customer: reply on the quote"). It is kept in the task's line (`for:"…"`) and shown on
 * the task page, in the lists and in Focus. It is saved when the box is left or Enter is pressed,
 * and a change is also written in the task's log.
 */
export function WaitingFor({ task }: { task: Task }) {
  const saved = task.waitingFor ?? "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => {
    setDraft(saved);
  }, [saved, task.key]);

  const save = (): void => {
    const text = draft.trim().replace(/\s+/g, " ");
    if (text === saved) return;
    void (async () => {
      await useTaskStore.getState().setWaitingFor(task, text === "" ? null : text);
    })();
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="waiting-for" className="text-xs text-muted-foreground">
        Waiting for (optional)
      </label>
      <Input
        id="waiting-for"
        value={draft}
        maxLength={120}
        placeholder="For example: the customer, reply on the quote"
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <span className="text-xs text-muted-foreground">
        Shown in the task list and on this page. Short is best.
      </span>
    </div>
  );
}
