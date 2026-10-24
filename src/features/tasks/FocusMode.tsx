import { Loader2 } from "lucide-react";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/bindings/Task";
import { epicGroups, isOpen } from "@/lib/taskLogic";
import { EpicProgress } from "./TasksView";
import { FocusTask } from "./FocusTask";
import { Button } from "@/components/ui/button";
import { CaptureBox } from "@/features/capture/CaptureBox";
import { askAi, type AiAnswer } from "@/lib/askAi";
import { useNow } from "@/features/chat/useNow";
import { findTask, useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

const LENGTHS = [15, 25, 45];
const RING = 2 * Math.PI * 88;

/** `18:30` from milliseconds. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** The next open task of the epic after `current` (or the first open one before it). */
function nextOpen(tasks: readonly Task[], current: Task): Task | undefined {
  const open = tasks.filter((t) => t.path === current.path && isOpen(t) && t.line !== current.line);
  return open.find((t) => t.line > current.line) ?? open[0];
}

/**
 * Focus on an epic task: the whole epic on one page, with the task worked on open and marked and
 * the rest folded, a timer, "Do this now" and a place to put thoughts that pop up. Everything else
 * is hidden. What is written here is the task's ordinary log, so leaving puts you back where you
 * were.
 */
export function FocusMode() {
  const open = useUiStore((s) => s.focusOpen);
  const tasks = useTaskStore((s) => s.tasks);
  const selected = useTaskStore((s) => s.selected);
  const [minutes, setMinutes] = useState(25);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState(25 * 60_000);
  const [parked, setParked] = useState(0);
  const aiOff = useAiBlocked();
  const [stuck, setStuck] = useState<{ text: string | null; error: string | null } | null>(null);
  const epics = useTaskStore((s) => s.epics);
  const epicOrder = useTaskStore((s) => s.epicOrder);
  const [unfolded, setUnfolded] = useState<Record<number, boolean>>({});
  const [askTick, setAskTick] = useState(false);
  const [epicDone, setEpicDone] = useState(false);
  const ask = useRef<AiAnswer | null>(null);
  const now = useNow(open && endAt !== null);

  const task = findTask(tasks, selected);
  const group = useMemo(
    () =>
      task ? (epicGroups(tasks, epics, epicOrder).find((g) => g.path === task.path) ?? null) : null,
    [tasks, epics, epicOrder, task],
  );
  const running = endAt !== null;
  const remaining = running ? Math.max(0, endAt - now) : left;
  const over = running && remaining === 0;

  useEffect(() => {
    if (!open) return;
    setEndAt(null);
    setLeft(minutes * 60_000);
    setStuck(null);
    setParked(0);
    setUnfolded({});
    setAskTick(false);
    setEpicDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts fresh each time it opens
  }, [open]);

  // The task worked on is "Doing" (once each time Focus opens on it).
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      marked.current = null;
      return;
    }
    if (!task || task.done) return;
    const id = `${task.path}:${String(task.line)}`;
    if (marked.current === id) return;
    marked.current = id;
    if (task.status !== "doing") void useTaskStore.getState().setStatus(task, "doing");
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") useUiStore.getState().setFocusOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      ask.current?.cancel();
    },
    [],
  );

  if (!open) return null;
  if (epicDone && group) {
    return (
      <div
        role="dialog"
        aria-modal
        aria-label="Focus"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background"
      >
        <p className="text-lg font-semibold">Epic task done</p>
        <p className="text-sm text-muted-foreground">Every task in {group.title} is done.</p>
        <Button
          onClick={() => {
            useUiStore.getState().setFocusOpen(false);
            useUiStore.getState().setCenterView("tasks");
          }}
        >
          Back to the task list
        </Button>
      </div>
    );
  }
  if (!task) {
    return (
      <div
        role="dialog"
        aria-modal
        aria-label="Focus"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background"
      >
        <p className="text-sm text-muted-foreground">There is no task to focus on.</p>
        <Button
          onClick={() => {
            useUiStore.getState().setFocusOpen(false);
          }}
        >
          Back
        </Button>
      </div>
    );
  }

  const store = useTaskStore.getState();
  const stepIndex = task.steps.findIndex((s) => !s.done);
  const step = stepIndex >= 0 ? task.steps[stepIndex] : undefined;
  const allDone = task.steps.length > 0 && step === undefined;
  const current = step?.text ?? task.title;
  const progress = 1 - remaining / (minutes * 60_000);

  const start = (): void => {
    setEndAt(Date.now() + left);
  };
  const pause = (): void => {
    setLeft(Math.max(0, (endAt ?? Date.now()) - Date.now()));
    setEndAt(null);
  };
  const setLength = (m: number): void => {
    setMinutes(m);
    setLeft(m * 60_000);
    setEndAt(null);
  };

  /** Marks a task as the one worked on: it opens, and its status becomes Doing. */
  const work = (t: Task): void => {
    setAskTick(false);
    setStuck(null);
    store.select({ path: t.path, line: t.line, title: t.title });
  };

  /** Ticks the task, then moves the mark to the next open task, or says the epic is done. */
  const tickTask = async (): Promise<void> => {
    setAskTick(false);
    await store.setDone(task.path, task.line, task.key, true);
    const fresh = useTaskStore.getState().tasks;
    const now = findTask(fresh, { path: task.path, line: task.line, title: task.title }) ?? task;
    const next = nextOpen(fresh, now);
    if (next) work(next);
    else setEpicDone(true);
  };

  const done = (): void => {
    setStuck(null);
    if (step) {
      void store.setDone(task.path, step.line, step.key, true);
      // The last step: the task may be done too, but that is the user's call.
      if (task.steps.filter((s) => !s.done).length === 1) setAskTick(true);
    } else void tickTask();
  };

  const askStuck = (): void => {
    ask.current?.cancel();
    setStuck({ text: null, error: null });
    const have = task.steps.map((s) => `- [${s.done ? "x" : " "}] ${s.text}`).join("\n");
    const a = askAi(
      "The person is stuck on this. Suggest ONE tiny next step that takes under 5 minutes and is easy to start. Answer with one short sentence and nothing else. Write in the language of the task.",
      `Task: ${task.title}${have === "" ? "" : `\nSteps so far:\n${have}`}${step ? `\nStuck on: ${step.text}` : ""}`,
      task.path,
    );
    ask.current = a;
    a.promise
      .then((text) => {
        if (ask.current === a) setStuck({ text: text.replace(/^[-*]\s*/, ""), error: null });
      })
      .catch((e: unknown) => {
        if (ask.current === a)
          setStuck({ text: null, error: e instanceof Error ? e.message : "Something went wrong" });
      });
  };

  const tasksOfEpic = group?.tasks ?? [task];
  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Focus"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-6 py-3">
        <span className="section-label">Focus</span>
        <h2 className="min-w-0 truncate text-base font-semibold">{group?.title ?? task.title}</h2>
        {group && <EpicProgress group={group} />}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setUnfolded({});
          }}
        >
          Fold the rest
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            useUiStore.getState().setFocusOpen(false);
          }}
        >
          Leave focus <kbd className="text-[10px] opacity-60">Esc</kbd>
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-2.5">
          {tasksOfEpic.map((t) => (
            <FocusTask
              key={`${t.path}:${String(t.line)}`}
              task={t}
              marked={t.line === task.line}
              open={unfolded[t.line] === true}
              onToggle={() => {
                setUnfolded((u) => ({ ...u, [t.line]: u[t.line] !== true }));
              }}
              onWork={() => {
                work(t);
              }}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-5">
          <div className="relative flex size-52 items-center justify-center">
            <svg
              viewBox="0 0 200 200"
              className="absolute inset-0"
              role="img"
              aria-label={`${clock(remaining)} left of ${String(minutes)} minutes`}
            >
              <circle
                cx="100"
                cy="100"
                r="88"
                fill="none"
                stroke="var(--border)"
                strokeWidth="12"
              />
              <circle
                cx="100"
                cy="100"
                r="88"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * Math.min(1, Math.max(0, progress))}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tabular-nums" role="timer" aria-live="off">
                {clock(remaining)}
              </span>
              <span className="text-xs text-muted-foreground">of {minutes} min</span>
            </div>
          </div>

          <div role="group" aria-label="How long" className="flex gap-1">
            {LENGTHS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={minutes === m ? "default" : "outline"}
                aria-pressed={minutes === m}
                disabled={running}
                onClick={() => {
                  setLength(m);
                }}
              >
                {m} min
              </Button>
            ))}
          </div>

          {over && (
            <p
              role="status"
              className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground"
            >
              Time is up. Take a short break, then come back.
            </p>
          )}

          <div className="w-full rounded-xl border border-primary bg-card p-4">
            <span className="section-label">{allDone ? "Nicely done" : "Do this now"}</span>
            <p className="mt-1 text-lg leading-snug">
              {allDone ? "Every step is done. Mark the task as done when you are ready." : current}
            </p>
            {!allDone && (
              <p className="mt-1 text-xs text-muted-foreground">Only this. The rest is waiting.</p>
            )}
          </div>

          {/* The right column is narrow: the main button has its own line, so nothing runs out
              of the window. */}
          <div className="flex w-full flex-col gap-2">
            {allDone ? (
              <Button className="h-10 w-full" onClick={() => void tickTask()}>
                Mark the task as done
              </Button>
            ) : (
              <Button className="h-10 w-full" onClick={done}>
                {step ? "Done, next step" : "Done"}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-10" onClick={running ? pause : start}>
                {running
                  ? "Pause timer"
                  : over || left < minutes * 60_000
                    ? "Continue timer"
                    : "Start timer"}
              </Button>
              <Button
                variant="outline"
                className="h-10"
                disabled={
                  aiOff !== null || (stuck !== null && stuck.text === null && stuck.error === null)
                }
                title={
                  aiOff ??
                  "Cannot get started? The AI suggests one tiny first step, under five minutes."
                }
                onClick={askStuck}
              >
                Help me start
              </Button>
            </div>
          </div>

          {askTick && (
            <div
              role="alert"
              className="flex w-full flex-col gap-2 rounded-lg border bg-accent/40 p-3 text-sm"
            >
              <p>All steps are done. Tick the task too?</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void tickTask()}>
                  Tick the task
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAskTick(false);
                  }}
                >
                  Not yet
                </Button>
              </div>
            </div>
          )}

          {stuck !== null && (
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
              {stuck.text === null && stuck.error === null && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Looking for a smaller step…
                </p>
              )}
              {stuck.error !== null && <p className="text-destructive">{stuck.error}</p>}
              {stuck.text !== null && (
                <>
                  <p className="section-label">A smaller step</p>
                  <p className="mt-1">{stuck.text}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        void store.addStep(task, stuck.text ?? "");
                        setStuck(null);
                      }}
                    >
                      Add it as a step
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setStuck(null);
                      }}
                    >
                      No thanks
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-2 flex w-full flex-col gap-1.5">
            <span className="section-label">Something popped into your head?</span>
            <CaptureBox
              onSaved={() => {
                setParked((n) => n + 1);
              }}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {parked > 0
                ? `${String(parked)} written down. You can look at it when you are done.`
                : "Everything else is hidden while you focus."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
