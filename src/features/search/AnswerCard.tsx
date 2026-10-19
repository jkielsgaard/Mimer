import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { openFile } from "@/lib/actions";
import { api } from "@/lib/api";
import { askAi, type AiAnswer } from "@/lib/askAi";
import { questionWords } from "@/lib/question";
import { noteTitle } from "@/lib/utils";

/** The most notes the answer is made from, and the most of each that is read. */
const MAX_NOTES = 4;
const MAX_CHARS = 4_000;

const INSTRUCTION =
  "Answer the question at the top using ONLY the notes below it. Answer in two to four short sentences, in the language of the question. Say which note the answer comes from by its title. If the notes do not answer the question, say so in one sentence and do not guess.";

/** The notes that most likely hold the answer: by meaning when it is set up, else by its words. */
async function sources(question: string, semantic: boolean): Promise<string[]> {
  if (semantic) {
    try {
      const hits = await api.semanticSearch(question, MAX_NOTES);
      if (hits.length > 0) return [...new Set(hits.map((h) => h.path))].slice(0, MAX_NOTES);
    } catch {
      // Fall back to the words.
    }
  }
  const score = new Map<string, number>();
  const lists = await Promise.all(
    questionWords(question).map((w) =>
      api.search({ text: w, tag: null, folder: null }).catch(() => []),
    ),
  );
  for (const list of lists) {
    list.slice(0, 10).forEach((h, i) => {
      score.set(h.path, (score.get(h.path) ?? 0) + 10 - i);
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NOTES)
    .map(([p]) => p);
}

/**
 * "Answer from my notes" at the top of the search results, when the search reads like a question.
 * It is only asked when you press the button; the local AI reads a few notes and answers, with
 * the notes it used. Without an AI the card is not shown, and the results work as before.
 */
export function AnswerCard({ question, semantic }: { question: string; semantic: boolean }) {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "running" }
    | { phase: "done"; answer: string; used: string[] }
    | { phase: "error"; message: string }
  >({ phase: "idle" });
  const run = useRef<AiAnswer | null>(null);

  useEffect(() => {
    setState({ phase: "idle" });
    run.current?.cancel();
  }, [question]);
  useEffect(
    () => () => {
      run.current?.cancel();
    },
    [],
  );

  const ask = async (): Promise<void> => {
    setState({ phase: "running" });
    try {
      const used = await sources(question, semantic);
      if (used.length === 0) {
        setState({ phase: "done", answer: "No note seems to be about this.", used: [] });
        return;
      }
      const notes = await Promise.all(used.map((p) => api.readNote(p).catch(() => null)));
      const text = [
        `Question: ${question}`,
        ...notes
          .filter((n) => n !== null)
          .map((n) => `\n--- Note: ${noteTitle(n.path)} ---\n${n.content.slice(0, MAX_CHARS)}`),
      ].join("\n");
      const answer = askAi(INSTRUCTION, text, null);
      run.current = answer;
      setState({ phase: "done", answer: await answer.promise, used });
    } catch (e) {
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  };

  return (
    <section
      aria-label="Answer from my notes"
      className="mb-2 rounded-lg border border-primary/40 bg-card p-2.5 text-sm"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <span className="flex-1 text-xs font-semibold">Answer from my notes</span>
        {state.phase !== "running" && (
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => void ask()}>
            {state.phase === "idle" ? "Get an answer" : "Ask again"}
          </Button>
        )}
      </div>
      {state.phase === "running" && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Reading your notes…
        </p>
      )}
      {state.phase === "error" && (
        <p className="mt-1.5 text-xs text-destructive">{state.message}</p>
      )}
      {state.phase === "done" && (
        <>
          <p className="mt-1.5 whitespace-pre-wrap">{state.answer}</p>
          {state.used.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {state.used.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
                  onClick={() => void openFile(p)}
                >
                  {noteTitle(p)}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Made by the local AI from the notes above. Check it in the note.
          </p>
        </>
      )}
    </section>
  );
}
