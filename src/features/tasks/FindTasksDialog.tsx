import { Loader2 } from "lucide-react";
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
import { api } from "@/lib/api";
import { askAi, type AiAnswer } from "@/lib/askAi";
import { noteName, quickTaskText, stepsFromAnswer, todayIso } from "@/lib/taskLogic";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";

const STEPS_INSTRUCTION =
  "Read the note below (and the note it came from, if it is given). Suggest the next tasks that are still missing to get the work done. Write each as one short line that starts with '- ' and a verb. Do not repeat tasks that are already in it, and do not invent facts. Put the very first one first. If nothing is missing, answer exactly NONE. Write in the language of the note.";

const INSTRUCTION =
  "List the tasks in this note: things that someone has to do. Write each task as one short line that starts with '- ' and a verb. Add who does it, or when, in a few words only if the note says so. Do not invent tasks. Leave out things that are already ticked. If there are no tasks, answer exactly NONE. Write in the language of the note.";

/** The most of a note that is sent to the AI. */
const MAX_CHARS = 12_000;

/**
 * "Find tasks in this note": the local AI reads the open note and proposes tasks. You choose which
 * ones to keep, and only those are added, as checklist lines, to the epic task of the note.
 */
export function FindTasksDialog() {
  const open = useUiStore((s) => s.findTasksOpen);
  const opts = useUiStore((s) => s.findTasksOpts);
  const active = useVaultStore((s) => s.activePath);
  const path = opts.path ?? active;
  if (!open || path === null) return null;
  return <Finder path={path} mode={opts.mode} />;
}

function Finder({ path, mode }: { path: string; mode: "tasks" | "steps" }) {
  const [found, setFound] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const run = useRef<AiAnswer | null>(null);
  const close = (): void => {
    useUiStore.getState().setFindTasksOpen(false);
  };

  useEffect(() => {
    const life: { alive: boolean } = { alive: true };
    const alive = (): boolean => life.alive;
    void (async () => {
      try {
        const selection = useUiStore.getState().findTasksIn;
        let content = selection ?? (await api.readNote(path)).content;
        if (mode === "steps") {
          // The note the epic came from tells what the work is about.
          const epic = useTaskStore.getState().epics.find((e) => e.path === path);
          const from = epic?.source ? useVaultStore.getState().resolver.resolve(epic.source) : null;
          if (from !== null) {
            const origin = (await api.readNote(from)).content.slice(0, MAX_CHARS / 2);
            content = `The epic's note:\n${content}\n\nThe note it came from (${noteName(from)}):\n${origin}`;
          }
        }
        if (!alive()) return;
        const answer = askAi(
          mode === "steps" ? STEPS_INSTRUCTION : INSTRUCTION,
          content.slice(0, MAX_CHARS),
          path,
        );
        run.current = answer;
        const text = await answer.promise;
        if (!alive()) return;
        const list = /^\s*NONE\b/i.test(text) ? [] : stepsFromAnswer(text);
        setFound(list);
        setChosen(new Set(list.map((_, i) => i)));
      } catch (e) {
        if (alive()) setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
    return () => {
      life.alive = false;
      run.current?.cancel();
    };
  }, [path, mode]);

  const add = async (): Promise<void> => {
    if (found === null) return;
    setAdding(true);
    try {
      const today = todayIso();
      // A date word at the end of a line (for example "by friday") becomes the due date. A task
      // without a date is left without one: it is in the note, and Mimer does not plan it.
      const texts = found
        .filter((_, i) => chosen.has(i))
        .map((t) => quickTaskText(t, today).replace(/\s+plan:\S+$/, ""));
      // Tasks found in an ordinary note go into the epic task made for it; steps go into the epic.
      const target = mode === "steps" ? path : await useTaskStore.getState().epicFor(path);
      if (target === null) return;
      await useTaskStore.getState().addToNote(target, texts);
      close();
    } catch (e) {
      reportError(e);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "steps" ? "Suggest steps from the note" : "Find tasks in this note"}
          </DialogTitle>
          <DialogDescription>
            {noteName(path)}.{" "}
            {mode === "steps"
              ? "The AI reads the note and suggests the next steps. You choose which ones to keep, and only those are added to the epic task."
              : "The AI reads the note and suggests tasks. You choose which ones to keep, and only those are added to the epic task of this note."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-28">
          {found === null && error === null && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              The AI is reading the note. A small model can take a minute.
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
          {found !== null && found.length === 0 && (
            <p className="text-sm text-muted-foreground">The AI found no tasks in this note.</p>
          )}
          {found !== null && found.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Suggested tasks">
              {found.map((t, i) => (
                <li key={`${String(i)}-${t}`}>
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
                    <span className="text-sm">{t}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={adding || found === null || chosen.size === 0}
            onClick={() => {
              void add();
            }}
          >
            {adding
              ? "Adding…"
              : `Add ${String(chosen.size)} task${chosen.size === 1 ? "" : "s"} to the epic task`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
