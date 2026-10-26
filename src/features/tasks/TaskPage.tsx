import { ArrowLeft, Check, FileText, Layers, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { noteName, shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { findTask, useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { BreakDownDialog } from "./BreakDownDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeleteButton } from "@/components/DeleteButton";
import { MoveButtons, moveKey } from "@/components/MoveButtons";
import { InlineEdit, RowActions } from "@/components/RowActions";
import { ViewHeader } from "@/components/ViewHeader";
import { AiAsk } from "@/components/AiAsk";
import { NoteBox } from "@/components/NoteBox";
import type { Task } from "@/bindings/Task";
import type { TaskLog } from "@/bindings/TaskLog";
import { useAiBlocked } from "@/lib/useAiBlocked";

const STATUSES: { id: string; label: string }[] = [
  { id: "", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "waiting", label: "Waiting" },
];

/** The lines of the task as they are written in its note: read-only, so it cannot be broken. */
function MarkdownOfTask({ path, from, to }: { path: string; from: number; to: number }) {
  const [text, setText] = useState<string | null>(null);
  const tasks = useTaskStore((s) => s.tasks);
  useEffect(() => {
    let alive = true;
    api
      .readNote(path)
      .then((n) => {
        if (alive)
          setText(
            n.content
              .split("\n")
              .slice(from, to + 1)
              .join("\n")
              .replace(/\r/g, ""),
          );
      })
      .catch(() => {
        if (alive) setText("");
      });
    return () => {
      alive = false;
    };
  }, [path, from, to, tasks]);
  return (
    <section aria-label="Markdown of the task" className="flex flex-col gap-1">
      <h3 className="section-label">Markdown</h3>
      <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
        {text ?? "…"}
      </pre>
      <p className="text-[11px] text-muted-foreground">
        This is how the task is written in {noteName(path)}. Use the fields below to change it.
      </p>
    </section>
  );
}

const STATUS_INSTRUCTION =
  "You write a status update for a colleague about one task. Use ONLY the facts below: the title, the status, the note, the steps and the dated log lines. Write one or two short sentences, in the language of the log: what has been done and what it waits for. Do not invent anything and do not repeat the log line by line. Answer with the sentences only.";

/** How many of the latest log lines the status line is built from. */
const STATUS_LOG_LINES = 10;

/** The log lines a status line is built from: the written ones, not Mimer's own "Status:" lines. */
export function statusLogLines(task: Task): TaskLog[] {
  return task.log.filter((l) => !/^Status:\s/.test(l.text)).slice(-STATUS_LOG_LINES);
}

/** The facts the status line is written from. */
export function statusFacts(task: Task, stepsDone: number): string {
  return [
    `Task: ${task.title}`,
    task.status !== null ? `Status: ${task.status}` : "",
    task.steps.length > 0 ? `Steps: ${String(stepsDone)} of ${String(task.steps.length)} done` : "",
    task.note !== "" ? `Note: ${task.note}` : "",
    "Log (oldest first):",
    ...statusLogLines(task).map((l) => `${l.date} ${l.text}`),
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** One line of the log: its date and text, with buttons to change or remove it. */
function LogItem({ task, entry, today }: { task: Task; entry: TaskLog; today: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [date, setDate] = useState(entry.date);
  const [deleting, setDeleting] = useState(false);
  const store = useTaskStore.getState();
  const save = (): void => {
    const t = text.trim();
    if (t === "" || date === "") return;
    setEditing(false);
    if (t !== entry.text || date !== entry.date) void store.editLog(task, entry, date, t);
  };
  return (
    <li className="group relative pb-4">
      <span
        aria-hidden
        className="absolute -left-[27px] top-1 size-2.5 rounded-full border-2 border-primary bg-card"
      />
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            type="date"
            aria-label="Date of the log line"
            className="h-8 w-40"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
          <Textarea
            aria-label="Text of the log line"
            rows={2}
            className="min-h-0 resize-y"
            value={text}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                setText(entry.text);
                setDate(entry.date);
                setEditing(false);
              }
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={text.trim() === "" || date === ""} onClick={save}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(entry.text);
                setDate(entry.date);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {entry.date === today ? "Today" : shortDate(entry.date)}
            <span className="ml-auto flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Change this line"
                title="Change this line"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Delete this line"
                title="Delete this line"
                onClick={() => {
                  setDeleting(true);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </span>
          <p className="text-sm">{entry.text}</p>
        </>
      )}
      <ConfirmDialog
        open={deleting}
        title="Delete this line from the log?"
        description="It stays in the version history of the note, so it can be brought back."
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          setDeleting(false);
          void store.deleteLog(task, entry);
        }}
      />
    </li>
  );
}

/** One task: its status and date, its steps, and what has happened so far. */
export function TaskPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const selected = useTaskStore((s) => s.selected);
  const task = findTask(tasks, selected);
  const [step, setStep] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [editStep, setEditStep] = useState<number | null>(null);
  const [log, setLog] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [showMd, setShowMd] = useState(false);
  const back = (): void => {
    useUiStore.getState().setCenterView("tasks");
  };
  const store = useTaskStore.getState();
  const aiOff = useAiBlocked();
  const epics = useTaskStore((s) => s.epics);
  const epic = task ? epics.find((e) => e.path === task.path) : undefined;

  if (!task) {
    return (
      <section aria-label="Task" className="flex h-full flex-col gap-3 p-6">
        <Button size="sm" variant="ghost" className="w-fit" onClick={back}>
          <ArrowLeft /> Tasks
        </Button>
        <p className="text-sm text-muted-foreground">
          This task is no longer there. It may have been changed in its note.
        </p>
      </section>
    );
  }

  const stepsDone = task.steps.filter((s) => s.done).length;
  const status = task.status ?? "";
  const toEpic = (): void => {
    useTaskStore.getState().openEpic(task.path);
  };
  const today = todayIso();
  const firstOpen = task.steps.findIndex((s) => !s.done);

  return (
    <section aria-label="Task" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title="Task" back={{ label: epic?.title ?? noteName(task.path), run: toEpic }}>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={showMd}
          onClick={() => {
            setShowMd(!showMd);
          }}
        >
          {showMd ? "Hide Markdown" : "Show Markdown"}
        </Button>
        <DeleteButton
          what="this task"
          where="open its note and choose History to bring it back."
          onDelete={() => {
            void store.remove(task);
          }}
        />
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={task.done ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "mt-2 flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
                  task.done && "border-primary bg-primary text-primary-foreground",
                )}
                onClick={() => {
                  void store.setDone(task.path, task.line, task.key, !task.done);
                }}
              >
                {task.done && <Check className="size-3.5" aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                {editTitle ? (
                  <InlineEdit
                    value={task.title}
                    label="Title of the task"
                    className="text-2xl font-semibold leading-snug"
                    onSave={(v) => {
                      setEditTitle(false);
                      void store.rename(task.path, task.line, task.key, v);
                    }}
                    onCancel={() => {
                      setEditTitle(false);
                    }}
                  />
                ) : (
                  <div className="group flex items-center gap-2">
                    <h2
                      className={cn(
                        "text-2xl font-semibold leading-snug",
                        task.done && "line-through",
                      )}
                    >
                      {task.title}
                    </h2>
                    <RowActions
                      what="the title"
                      onEdit={() => {
                        setEditTitle(true);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {showMd && <MarkdownOfTask path={task.path} from={task.line} to={task.end} />}

            <NoteBox
              label="Note"
              value={task.note}
              placeholder="Anything to remember about this task"
              hint="Kept in the note under the task, apart from the log."
              onSave={(text) => {
                void store.setNote(task, text);
              }}
            />

            <section aria-label="Steps" className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h3 className="flex-1 section-label">
                  Steps
                  {task.steps.length > 0 &&
                    ` · ${String(stepsDone)} of ${String(task.steps.length)}`}
                </h3>
                {task.steps.length > 0 && (
                  <div
                    role="progressbar"
                    aria-label="Steps done"
                    aria-valuemin={0}
                    aria-valuemax={task.steps.length}
                    aria-valuenow={stepsDone}
                    className="h-1.5 w-36 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${String((stepsDone / task.steps.length) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <ul>
                {task.steps.map((s, i) => (
                  <li
                    key={s.line}
                    className="group flex items-center gap-3 py-1"
                    onKeyDown={(e) => {
                      moveKey(
                        e,
                        s.text,
                        { up: i > 0, down: i < task.steps.length - 1 },
                        () => store.move(task.path, s.line, s.key, true),
                        () => store.move(task.path, s.line, s.key, false),
                      );
                    }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={s.done}
                      aria-label={`${s.done ? "Mark as not done" : "Mark as done"}: ${s.text}`}
                      className={cn(
                        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
                        s.done && "border-primary bg-primary text-primary-foreground",
                      )}
                      onClick={() => {
                        void store.setDone(task.path, s.line, s.key, !s.done);
                      }}
                    >
                      {s.done && <Check className="size-3" aria-hidden />}
                    </button>
                    {editStep === s.line ? (
                      <InlineEdit
                        value={s.text}
                        label={`Text of the step ${s.text}`}
                        onSave={(v) => {
                          setEditStep(null);
                          void store.rename(task.path, s.line, s.key, v);
                        }}
                        onCancel={() => {
                          setEditStep(null);
                        }}
                      />
                    ) : (
                      <>
                        <span
                          className={cn(
                            "min-w-0 text-sm",
                            s.done && "text-muted-foreground line-through",
                            i === firstOpen && "font-semibold",
                          )}
                        >
                          {s.text}
                        </span>
                        <RowActions
                          what={`the step ${s.text}`}
                          onEdit={() => {
                            setEditStep(s.line);
                          }}
                          onDelete={() => {
                            void store.removeStep(task, s);
                          }}
                        />
                        <span className="flex-1" />
                      </>
                    )}
                    {i === firstOpen && (
                      <span className="rounded-full bg-accent px-2 text-xs text-accent-foreground">
                        Next
                      </span>
                    )}
                    <MoveButtons
                      label={s.text}
                      canUp={i > 0}
                      canDown={i < task.steps.length - 1}
                      onUp={() => store.move(task.path, s.line, s.key, true)}
                      onDown={() => store.move(task.path, s.line, s.key, false)}
                    />
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step.trim() === "") return;
                  const text = step;
                  setStep("");
                  void store.addStep(task, text);
                }}
              >
                <Input
                  aria-label="Add a step"
                  className="h-8"
                  placeholder="Add a step"
                  value={step}
                  onChange={(e) => {
                    setStep(e.target.value);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={aiOff !== null}
                  title={aiOff ?? "The local AI suggests small steps; you choose which to add"}
                  onClick={() => {
                    setBreaking(true);
                  }}
                >
                  <Sparkles /> Break it down
                </Button>
              </form>
            </section>

            <section aria-label="What has happened" className="flex flex-col gap-3">
              <h3 className="section-label">What has happened</h3>
              <form
                className="flex items-start gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (log.trim() === "") return;
                  const text = log;
                  setLog("");
                  void store.addLog(task, text);
                }}
              >
                <Textarea
                  aria-label="Write what happened"
                  rows={2}
                  className="min-h-0 flex-1 resize-none"
                  placeholder="Write what happened. It gets today's date."
                  value={log}
                  onChange={(e) => {
                    setLog(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && log.trim() !== "") {
                      e.preventDefault();
                      const text = log;
                      setLog("");
                      void store.addLog(task, text);
                    }
                  }}
                />
                <Button type="submit" size="sm" disabled={log.trim() === ""}>
                  Add to the log
                </Button>
              </form>
              {task.log.length > 0 && (
                <AiAsk
                  label="Write a status line from the log"
                  title="Status line"
                  notePath={task.path}
                  instruction={STATUS_INSTRUCTION}
                  text={() => statusFacts(task, stepsDone)}
                  actions={(answer, close) => (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          void store.addLog(task, answer);
                          close();
                        }}
                      >
                        Add it to the log
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(answer).catch(() => undefined);
                        }}
                      >
                        Copy
                      </Button>
                    </>
                  )}
                />
              )}
              {task.log.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing yet.</p>
              ) : (
                <ol className="ml-1.5 border-l-2 pl-5">
                  {[...task.log].reverse().map((l) => (
                    <LogItem key={l.line} task={task} entry={l} today={today} />
                  ))}
                </ol>
              )}
            </section>
          </div>
          <aside
            aria-label="About the task"
            className="flex h-fit flex-col gap-4 rounded-lg border bg-sidebar p-4 text-sm lg:sticky lg:top-0"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Status</span>
              <div
                role="group"
                aria-label="Status"
                className="grid grid-cols-3 overflow-hidden rounded-md border bg-background text-sm"
              >
                {STATUSES.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={status === s.id}
                    className={cn(
                      "px-2 py-1.5",
                      i > 0 && "border-l",
                      status === s.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onClick={() => {
                      if (status !== s.id) void store.setStatus(task, s.id);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {task.made !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Made</span>
                <span>{shortDate(task.made)}</span>
              </div>
            )}
            <div className="flex flex-col gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                title="Go to the epic this task belongs to"
                onClick={toEpic}
              >
                <Layers /> Epic: {epic?.title ?? noteName(task.path)}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                title="Open the note this task is written in"
                onClick={() => {
                  void useVaultStore.getState().openNote(task.path);
                }}
              >
                <FileText /> Open the note
              </Button>
              {task.tags.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {task.tags.map((t) => `#${t}`).join(" ")}
                </span>
              )}
            </div>
          </aside>
        </div>
      </div>
      {breaking && (
        <BreakDownDialog
          task={task}
          onClose={() => {
            setBreaking(false);
          }}
        />
      )}
    </section>
  );
}
