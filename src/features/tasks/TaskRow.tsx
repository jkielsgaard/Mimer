import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Task } from "@/bindings/Task";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoveButtons, moveKey } from "@/components/MoveButtons";
import { InlineEdit, RowActions } from "@/components/RowActions";
import { TaskNoteChip } from "@/features/tasks/TaskNote";
import { cn } from "@/lib/utils";
import { noteName, shortDate } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { PlainButton } from "@/components/ui/plain-button";
import { InlineInput } from "@/components/ui/inline-input";

/** A checkbox for a task or a step. */
function Tick({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <PlainButton
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
    </PlainButton>
  );
}

/**
 * The status of a task as a small label at the right end of its row: Doing, Waiting or Dropped.
 * A task without a status shows nothing. The status is set on the task page, and Focus sets Doing.
 */
export function StatusChip({ status }: { status: string | null }) {
  if (status === null || status === "") return null;
  const tone =
    status === "doing"
      ? "bg-accent text-accent-foreground"
      : status === "waiting"
        ? "bg-warning/25 text-foreground"
        : "bg-muted text-muted-foreground line-through";
  return (
    <span
      title={`Status: ${status}`}
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize", tone)}
    >
      {status}
    </span>
  );
}

/** `19 Oct` (the day a task was made). */
function madeLabel(iso: string): string {
  return shortDate(iso).replace(/^\S+ /, "");
}

/**
 * One task in the list: tick it, open it, or focus on it. A task with steps can be unfolded to
 * tick its steps or add one right in the list. It shows its status (when not To do), how many
 * steps are done and the day it was made.
 */
export function TaskRow({
  task,
  showNote = true,
  canMove,
}: {
  task: Task;
  /** Show the name of the note under the title. */
  showNote?: boolean;
  /** Whether the task can move up or down in its note; leave out where it cannot be moved. */
  canMove?: { up: boolean; down: boolean };
}) {
  const { setDone, open, addStep } = useTaskStore.getState();
  const id = `${task.path}:${String(task.line)}`;
  const stepsOpen = useTaskStore((s) => s.openTasks[id] === true);
  const [step, setStep] = useState("");
  // What is open for change: the title of the task, or the step at that line.
  const [editing, setEditing] = useState<"title" | number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const stepsDone = task.steps.filter((s) => s.done).length;
  const dim = task.done || task.status === "dropped";
  const moveUp = () => useTaskStore.getState().move(task.path, task.line, task.key, true);
  const moveDown = () => useTaskStore.getState().move(task.path, task.line, task.key, false);
  const facts = [
    showNote ? noteName(task.path) : null,
    task.steps.length > 0 ? `${String(stepsDone)} of ${String(task.steps.length)}` : null,
    task.made !== null ? madeLabel(task.made) : null,
  ].filter((x) => x !== null);
  return (
    <li className="flex flex-col">
      <div
        className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted"
        onKeyDown={(e) => {
          if (canMove) moveKey(e, task.title, canMove, moveUp, moveDown);
        }}
      >
        {task.steps.length > 0 ? (
          <PlainButton
            type="button"
            aria-expanded={stepsOpen}
            aria-label={`${stepsOpen ? "Hide" : "Show"} the steps of ${task.title}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              useTaskStore.getState().toggleTaskOpen(id);
            }}
          >
            {stepsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </PlainButton>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <Tick
          done={task.done}
          label={task.title}
          onToggle={() => {
            void setDone(task.path, task.line, task.key, !task.done);
          }}
        />
        {editing === "title" ? (
          <InlineEdit
            value={task.title}
            label={`Title of ${task.title}`}
            className="text-sm font-semibold"
            onSave={(t) => {
              setEditing(null);
              void useTaskStore.getState().rename(task.path, task.line, task.key, t);
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        ) : (
          <>
            <PlainButton
              type="button"
              className={cn(
                "min-w-0 truncate text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring",
                dim && "font-normal text-muted-foreground line-through",
              )}
              onClick={() => {
                open(task);
              }}
            >
              {task.title}
            </PlainButton>
            <RowActions
              what={`the task ${task.title}`}
              onEdit={() => {
                setEditing("title");
              }}
              onDelete={() => {
                setDeleting(true);
              }}
            />
            <span className="flex-1" />
          </>
        )}
        <TaskNoteChip task={task} />
        {task.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="hidden rounded-full bg-accent px-2 text-xs text-accent-foreground sm:inline"
          >
            #{t}
          </span>
        ))}
        {facts.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {facts.join(" · ")}
          </span>
        )}
        {!task.done && <StatusChip status={task.status} />}
        {canMove && (
          <MoveButtons
            label={task.title}
            canUp={canMove.up}
            canDown={canMove.down}
            onUp={moveUp}
            onDown={moveDown}
          />
        )}
      </div>
      {stepsOpen && (
        <ul aria-label={`Steps of ${task.title}`} className="mb-1 ml-12 flex flex-col gap-0.5">
          {task.steps.map((s) => (
            <li key={s.line} className="group flex items-center gap-2 py-0.5 text-sm">
              <Tick
                done={s.done}
                label={s.text}
                onToggle={() => {
                  void setDone(task.path, s.line, s.key, !s.done);
                }}
              />
              {editing === s.line ? (
                <InlineEdit
                  value={s.text}
                  label={`Text of the step ${s.text}`}
                  onSave={(t) => {
                    setEditing(null);
                    void useTaskStore.getState().rename(task.path, s.line, s.key, t);
                  }}
                  onCancel={() => {
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <span className={cn(s.done && "text-muted-foreground line-through")}>
                    {s.text}
                  </span>
                  <RowActions
                    what={`the step ${s.text}`}
                    onEdit={() => {
                      setEditing(s.line);
                    }}
                    onDelete={() => {
                      void useTaskStore.getState().removeStep(task, s);
                    }}
                  />
                </>
              )}
            </li>
          ))}
          <li>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = step.trim();
                if (text === "") return;
                setStep("");
                void addStep(task, text);
              }}
            >
              <InlineInput
                aria-label={`Add a step to ${task.title}`}
                placeholder="+ Add a step"
                value={step}
                onChange={(e) => {
                  setStep(e.target.value);
                }}
                className="w-full max-w-sm rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm placeholder:text-muted-foreground hover:border-input focus-visible:border-input focus-visible:outline-none"
              />
            </form>
          </li>
        </ul>
      )}
      <ConfirmDialog
        open={deleting}
        title={`Delete the task “${task.title}”?`}
        description={
          task.steps.length > 0
            ? `Its ${String(task.steps.length)} steps go too. They stay in the version history of the note, so they can be brought back.`
            : "It stays in the version history of the note, so it can be brought back."
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          setDeleting(false);
          void useTaskStore.getState().remove(task);
        }}
      />
    </li>
  );
}
