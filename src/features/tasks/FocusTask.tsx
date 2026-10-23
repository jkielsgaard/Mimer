import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Task } from "@/bindings/Task";
import { Button } from "@/components/ui/button";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/taskStore";

/** A checkbox for a task or a step in Focus. */
function Tick({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${label}`}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
        done && "border-primary bg-primary text-primary-foreground",
      )}
      onClick={onToggle}
    >
      {done && <Check className="size-3" aria-hidden />}
    </button>
  );
}

/** `Today`, else `Tue 20 Oct`. */
function logDay(iso: string): string {
  return iso === todayIso() ? "Today" : shortDate(iso);
}

/**
 * One task of the epic in Focus. The task worked on is open and marked, with its note, its steps
 * (the next one marked Now) and a box to write what has happened. Any other task can be unfolded
 * to read it, tick a step or write a line, and "Work on this" moves the mark to it.
 */
export function FocusTask({
  task,
  marked,
  open,
  onToggle,
  onWork,
}: {
  task: Task;
  marked: boolean;
  open: boolean;
  onToggle: () => void;
  onWork: () => void;
}) {
  const store = useTaskStore.getState();
  const [log, setLog] = useState("");
  const shown = marked || open;
  const now = marked ? task.steps.findIndex((s) => !s.done) : -1;
  const stepsDone = task.steps.filter((s) => s.done).length;
  return (
    <section
      aria-label={task.title}
      aria-current={marked ? "step" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card px-4 py-3",
        marked && "border-2 border-primary px-[15px] py-[11px]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-expanded={shown}
          aria-label={`${shown ? "Fold" : "Unfold"} ${task.title}`}
          disabled={marked}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          onClick={onToggle}
        >
          {shown ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Tick
          done={task.done}
          label={task.title}
          onToggle={() => {
            void store.setDone(task.path, task.line, task.key, !task.done);
          }}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold",
            marked ? "text-lg" : "text-sm",
            task.done && "font-normal text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        {marked ? (
          <span className="rounded-full bg-accent px-2.5 text-xs font-semibold text-accent-foreground">
            Working on it
          </span>
        ) : (
          <>
            {task.steps.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {stepsDone} of {task.steps.length}
              </span>
            )}
            {!task.done && (
              <Button size="sm" variant="outline" onClick={onWork}>
                Work on this
              </Button>
            )}
          </>
        )}
      </div>

      {shown && (
        <div className="ml-10 flex flex-col gap-3">
          {task.note !== "" && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{task.note}</p>
          )}
          {task.steps.length > 0 && (
            <ul aria-label={`Steps of ${task.title}`} className="flex flex-col gap-1">
              {task.steps.map((s, i) => (
                <li
                  key={s.line}
                  className={cn(
                    "-mx-2.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm",
                    i === now && "bg-accent/60",
                  )}
                >
                  <Tick
                    done={s.done}
                    label={s.text}
                    onToggle={() => {
                      void store.setDone(task.path, s.line, s.key, !s.done);
                    }}
                  />
                  <span
                    className={cn(
                      "flex-1",
                      s.done && "text-muted-foreground line-through",
                      i === now && "font-semibold",
                    )}
                  >
                    {s.text}
                  </span>
                  {i === now && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      Now
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const text = log.trim();
              if (text === "") return;
              setLog("");
              void store.addLog(task, text);
            }}
          >
            <label
              htmlFor={`happened-${String(task.line)}`}
              className="section-label text-muted-foreground"
            >
              What has happened
            </label>
            <input
              id={`happened-${String(task.line)}`}
              value={log}
              placeholder="Write it as you go. Enter adds it with today's date."
              onChange={(e) => {
                setLog(e.target.value);
              }}
              className="rounded-md border bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </form>
          {task.log.length > 0 && (
            <ul aria-label={`What has happened in ${task.title}`} className="flex flex-col gap-0.5">
              {[...task.log]
                .reverse()
                .slice(0, 3)
                .map((l) => (
                  <li key={l.line} className="text-sm">
                    <span className="text-muted-foreground">{logDay(l.date)}</span> · {l.text}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
