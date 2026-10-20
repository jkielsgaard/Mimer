import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/bindings/Task";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { askAi, type AiAnswer } from "@/lib/askAi";
import { stepsFromAnswer } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";

const INSTRUCTION =
  "Break the task into 3 to 6 small, concrete steps. Use what the note says, so the steps fit it. Each step starts with a verb and can be done in 5 to 50 minutes. Put the very first step first. Answer with one step per line, starting with '- ', and nothing else. Write in the language of the task.";

const SMALLER =
  "Break the task into 4 to 8 VERY small steps, each doable in under 15 minutes. Put the very first step first. Answer with one step per line, starting with '- ', and nothing else. Write in the language of the task.";

/** The most of the note that is sent along with the task. */
const NOTE_CHARS = 6_000;

/** What the AI reads: the task, its steps and the note it is in, so the steps fit the note. */
async function context(t: Task): Promise<string> {
  const have =
    t.steps.length > 0
      ? `\nSteps already there:\n${t.steps.map((s) => `- ${s.text}`).join("\n")}`
      : "";
  let note = "";
  try {
    note = (await api.readNote(t.path)).content.slice(0, NOTE_CHARS);
  } catch {
    // The title alone is enough to go on.
  }
  return `Task: ${t.title}${have}${note === "" ? "" : `\n\nThe note the task is in:\n---\n${note}\n---`}`;
}

/**
 * "Break it down": the AI proposes small steps for a task, you choose which stay, and only
 * then are they written into the note.
 */
export function BreakDownDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const run = useRef<AiAnswer | null>(null);

  const ask = (instruction: string): void => {
    run.current?.cancel();
    setSteps(null);
    setError(null);
    let cancelled = false;
    const answer = {
      cancel: (): void => {
        cancelled = true;
        inner?.cancel();
      },
      promise: Promise.resolve("").then(async () => {
        const text = await context(task);
        if (cancelled) throw new Error("Stopped");
        inner = askAi(instruction, text, task.path);
        return inner.promise;
      }),
    };
    let inner: AiAnswer | null = null;
    run.current = answer;
    answer.promise
      .then((text) => {
        if (run.current !== answer) return;
        const list = stepsFromAnswer(text);
        if (list.length === 0) {
          setError("The AI did not suggest any steps. Try again, or add steps yourself.");
          return;
        }
        setSteps(list);
        setChosen(new Set(list.map((_, i) => i)));
      })
      .catch((e: unknown) => {
        if (run.current === answer)
          setError(e instanceof Error ? e.message : "Something went wrong");
      });
  };

  useEffect(() => {
    ask(INSTRUCTION);
    return () => {
      run.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asks once when the dialog opens
  }, []);

  const add = async (): Promise<void> => {
    if (steps === null) return;
    setAdding(true);
    // One at a time: each step goes under the task, in order, and the task's line stays the same.
    for (const [i, text] of steps.entries()) {
      if (!chosen.has(i)) continue;
      const fresh = useTaskStore
        .getState()
        .tasks.find((t) => t.path === task.path && t.line === task.line);
      await useTaskStore.getState().addStep(fresh ?? task, text);
    }
    setAdding(false);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Break it down</DialogTitle>
          <DialogDescription>
            {task.title}. The AI suggests small steps. You choose what stays. Nothing is saved until
            you press Add.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-32">
          {steps === null && error === null && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              The AI is thinking. A small model can take a minute.
            </p>
          )}
          {error !== null && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {steps !== null && (
            <ul className="flex flex-col gap-2" aria-label="Suggested steps">
              {steps.map((s, i) => (
                <li key={`${String(i)}-${s}`}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={chosen.has(i)}
                      onChange={() => {
                        setChosen((c) => {
                          const next = new Set(c);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">
                      {s}
                      {i === 0 && (
                        <span className="ml-2 rounded-full bg-accent px-2 text-xs text-accent-foreground">
                          Start here
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex gap-2">
            <Button
              variant="outline"
              disabled={steps === null && error === null}
              onClick={() => {
                ask(SMALLER);
              }}
            >
              Make the steps smaller
            </Button>
            <Button
              disabled={adding || steps === null || chosen.size === 0}
              onClick={() => {
                void add();
              }}
            >
              {adding
                ? "Adding…"
                : `Add ${String(chosen.size)} step${chosen.size === 1 ? "" : "s"} to the task`}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
