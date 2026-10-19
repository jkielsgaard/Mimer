import { Check } from "lucide-react";
import type { Task } from "@/bindings/Task";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { durationLabel, noteName, whenLabel } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

/** One task in the list: tick it, open it, plan it or focus on it. */
export function TaskRow({
  task,
  today,
  planButtons = true,
  showWhen = true,
}: {
  task: Task;
  today: string;
  /** Show the Today and Later buttons. */
  planButtons?: boolean;
  showWhen?: boolean;
}) {
  const { setDone, open, plan } = useTaskStore.getState();
  const stepsDone = task.steps.filter((s) => s.done).length;
  const when = showWhen ? whenLabel(task, today) : null;
  const dim = task.done || task.status === "dropped";
  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${task.done ? "Mark as not done" : "Mark as done"}: ${task.title}`}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
          task.done && "border-primary bg-primary text-primary-foreground",
        )}
        onClick={() => {
          void setDone(task.path, task.line, task.key, !task.done);
        }}
      >
        {task.done && <Check className="size-3" aria-hidden />}
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          open(task);
        }}
      >
        <span
          className={cn(
            "truncate text-sm font-semibold",
            dim && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {noteName(task.path)}
          {task.steps.length > 0 && ` · ${String(stepsDone)} of ${String(task.steps.length)} steps`}
          {when !== null && ` · ${when}`}
        </span>
      </button>
      {task.tags.slice(0, 2).map((t) => (
        <span
          key={t}
          className="hidden rounded-full bg-accent px-2 text-xs text-accent-foreground sm:inline"
        >
          #{t}
        </span>
      ))}
      {task.status !== null && task.status !== "dropped" && (
        <span className="rounded-full border px-2 text-xs capitalize">{task.status}</span>
      )}
      {task.estMinutes !== null && (
        <span className="rounded-full border px-2 text-xs">{durationLabel(task.estMinutes)}</span>
      )}
      {!task.done && planButtons && (
        <span className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Put on today's list: ${task.title}`}
            onClick={() => {
              void plan(task, "today");
            }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Put off until later: ${task.title}`}
            onClick={() => {
              void plan(task, "later");
            }}
          >
            Later
          </Button>
        </span>
      )}
      {!task.done && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`Focus on ${task.title}`}
          onClick={() => {
            useTaskStore.getState().select({ path: task.path, line: task.line, title: task.title });
            useUiStore.getState().setFocusOpen(true);
          }}
        >
          Focus
        </Button>
      )}
    </li>
  );
}
