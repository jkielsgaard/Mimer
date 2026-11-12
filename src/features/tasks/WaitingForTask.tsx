import { Check, X } from "lucide-react";
import { useState } from "react";
import type { Task } from "@/bindings/Task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlainButton } from "@/components/ui/plain-button";
import { afterTarget, isOpen, noteName } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { StatusChip } from "./TaskRow";

/** How many matches the picker shows at once. */
const SHOWN = 6;

/**
 * Under the status Waiting: the task this one waits for. It is kept in the task's line
 * (`after:"note#title"`). When that task is done, this one says it is ready. Tasks are found by
 * typing part of their title; a task cannot wait for itself.
 */
export function WaitingForTask({ task }: { task: Task }) {
  const tasks = useTaskStore((s) => s.tasks);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const target = afterTarget(tasks, task);
  const store = useTaskStore.getState();

  const q = query.trim().toLowerCase();
  const matches = tasks
    .filter(
      (t) =>
        isOpen(t) &&
        !(t.path === task.path && t.line === task.line) &&
        (q === "" ||
          t.title.toLowerCase().includes(q) ||
          noteName(t.path).toLowerCase().includes(q)),
    )
    .slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Waiting for a task</span>
      {task.after !== null && (
        <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
          <div className="min-w-0 flex-1">
            {target !== null ? (
              <>
                <div className="truncate font-semibold">{target.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {noteName(target.path)}
                  {target.steps.length > 0 &&
                    ` · ${String(target.steps.filter((s) => s.done).length)} of ${String(target.steps.length)} steps`}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                That task was not found. It may have been renamed in a text editor or deleted.
              </div>
            )}
          </div>
          {target !== null && !isOpen(target) ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
              <Check className="size-3.5" aria-hidden /> Ready
            </span>
          ) : (
            target !== null && <StatusChip status={target.status} />
          )}
          <PlainButton
            type="button"
            aria-label="Stop waiting for this task"
            className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              void store.setAfter(task, null);
            }}
          >
            <X className="size-4" aria-hidden />
          </PlainButton>
        </div>
      )}
      {!choosing ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start"
          onClick={() => {
            setChoosing(true);
          }}
        >
          {task.after === null ? "Waiting for a task…" : "Choose another task…"}
        </Button>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border bg-background p-1.5">
          <Input
            autoFocus
            aria-label="Search for a task"
            placeholder="Part of the title or the epic"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setChoosing(false);
                setQuery("");
              }
            }}
          />
          <ul aria-label="Matching tasks" className="flex flex-col">
            {matches.map((t) => (
              <li key={`${t.path}:${String(t.line)}`}>
                <PlainButton
                  type="button"
                  className="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setChoosing(false);
                    setQuery("");
                    void store.setAfter(task, t);
                  }}
                >
                  <span className="truncate font-semibold">{t.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{noteName(t.path)}</span>
                </PlainButton>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2 py-1 text-xs text-muted-foreground">No open task matches.</li>
            )}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setChoosing(false);
              setQuery("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      <span className="text-xs text-muted-foreground">
        This task is marked ready when that task is done. The link is kept in this task&apos;s line.
      </span>
    </div>
  );
}
