import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiMistakesNote } from "@/components/AiMistakesNote";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { copyText } from "@/lib/clipboard";
import {
  IN_SHORT_INSTRUCTION,
  IN_SHORT_MAX_CHARS,
  inShortMarkdown,
  parseInShort,
  type InShort,
} from "@/lib/inShort";
import { noteName, taskText } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** Opens for the note that is open when "In short" is chosen in the AI menu. */
export function InShortDialog() {
  const open = useUiStore((s) => s.inShortOpen);
  const active = useVaultStore((s) => s.activePath);
  if (!open || active === null) return null;
  return <Short path={active} />;
}

/**
 * "In short": the AI reads the open note and gives its main points and the things to do. Nothing
 * is written to the note. The things to do are ticked by you, and only those become tasks, in
 * the epic of the note.
 */
function Short({ path }: { path: string }) {
  const [result, setResult] = useState<InShort | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState(0);
  const run = useRef<AiAnswer | null>(null);
  const close = useCallback((): void => {
    useUiStore.getState().setInShortOpen(false);
  }, []);

  useEffect(() => {
    const life: { alive: boolean } = { alive: true };
    const alive = (): boolean => life.alive;
    setResult(null);
    setError(null);
    void (async () => {
      try {
        const note = (await api.readNote(path)).content;
        if (!alive()) return;
        const answer = askAi(IN_SHORT_INSTRUCTION, note.slice(0, IN_SHORT_MAX_CHARS), path);
        run.current = answer;
        const parsed = parseInShort(await answer.promise);
        if (!alive()) return;
        if (parsed.points.length === 0 && parsed.todos.length === 0) {
          setError("The AI did not give any points. Try again.");
          return;
        }
        setResult(parsed);
        setChosen(new Set(parsed.todos.map((_, i) => i)));
      } catch (e) {
        if (alive()) setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
    return () => {
      life.alive = false;
      run.current?.cancel();
    };
  }, [path, round]);

  const add = async (): Promise<void> => {
    if (result === null) return;
    setAdding(true);
    try {
      const texts = result.todos.filter((_, i) => chosen.has(i)).map(taskText);
      const target = await useTaskStore.getState().epicFor(path);
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
          <DialogTitle>In short</DialogTitle>
          <DialogDescription>
            {noteName(path)}. The AI reads this note and gives its main points and what there is to
            do. Nothing is written to the note, and only the things you tick become tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-32 flex-col gap-4">
          {result === null && error === null && (
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
          {result !== null && result.points.length > 0 && (
            <section aria-label="The main points">
              <h3 className="section-label pb-1">The main points</h3>
              <ul className="ml-5 flex list-disc flex-col gap-1.5 text-sm">
                {result.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          )}
          {result !== null && (
            <section aria-label="Things to do">
              <h3 className="section-label pb-1">Things to do</h3>
              {result.todos.length === 0 ? (
                <p className="text-sm text-muted-foreground">The AI found nothing to do.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {result.todos.map((t, i) => (
                    <li key={`${String(i)}-${t}`}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2">
                        <Checkbox
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
            </section>
          )}
        </div>
        <DialogFooter className="items-center">
          <AiMistakesNote className="mr-auto" />
          <Button
            variant="ghost"
            onClick={() => {
              setRound((r) => r + 1);
            }}
          >
            Try again
          </Button>
          <Button
            variant="outline"
            disabled={result === null}
            onClick={() => {
              if (result) void copyText(inShortMarkdown(result));
            }}
          >
            Copy
          </Button>
          <Button
            disabled={adding || result === null || chosen.size === 0}
            onClick={() => {
              void add();
            }}
          >
            {adding
              ? "Adding…"
              : `Add ${String(chosen.size)} task${chosen.size === 1 ? "" : "s"} to the epic`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
