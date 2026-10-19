import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { askAi, type AiAnswer } from "@/lib/askAi";
import { useAiBlocked } from "@/lib/useAiBlocked";

/**
 * A button that asks the local AI one fixed thing and shows the answer under it, with the actions
 * `actions` gives for it (for example "Add to the log"). Nothing is written until one is pressed.
 * Without an AI the button is off and says why.
 */
export function AiAsk({
  label,
  instruction,
  text,
  notePath,
  title,
  actions,
}: {
  label: string;
  instruction: string;
  /** The text the AI reads, made when the button is pressed. */
  text: () => string;
  notePath: string | null;
  /** The heading over the answer. */
  title: string;
  actions: (answer: string, close: () => void) => ReactNode;
}) {
  const off = useAiBlocked();
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "running" }
    | { phase: "done"; answer: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });
  const run = useRef<AiAnswer | null>(null);
  useEffect(
    () => () => {
      run.current?.cancel();
    },
    [],
  );
  const close = (): void => {
    setState({ phase: "idle" });
  };
  const ask = async (): Promise<void> => {
    setState({ phase: "running" });
    try {
      const a = askAi(instruction, text(), notePath);
      run.current = a;
      setState({ phase: "done", answer: await a.promise });
    } catch (e) {
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={off !== null || state.phase === "running"}
        title={off ?? undefined}
        onClick={() => void ask()}
      >
        {state.phase === "running" ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Sparkles />
        )}
        {label}
      </Button>
      {state.phase === "error" && <p className="text-xs text-destructive">{state.message}</p>}
      {state.phase === "done" && (
        <div
          className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
          aria-live="polite"
        >
          <p className="section-label">{title}</p>
          <p className="whitespace-pre-wrap">{state.answer}</p>
          <div className="flex flex-wrap gap-2">
            {actions(state.answer, close)}
            <Button size="sm" variant="ghost" onClick={close}>
              No thanks
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
