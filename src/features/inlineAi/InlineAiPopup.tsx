import { AlertTriangle, Check, Copy, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AiOffNote } from "@/components/AiOffNote";
import { api, toApiError } from "@/lib/api";
import { missingFacts, factsOf } from "@/lib/facts";
import { stripCodeFence } from "@/lib/fence";
import { cn } from "@/lib/utils";
import { useNow } from "@/features/chat/useNow";
import { DiffView } from "@/components/DiffView";
import {
  INLINE_ACTIONS,
  inlineAction,
  type InlineAction,
  type InlineActionId,
} from "./inlineActions";

export interface InlineSelection {
  from: number;
  to: number;
  text: string;
  /** Viewport position of the selection start. */
  x: number;
  y: number;
}

/** A command to start at once when the popup opens (from the bubble over a selection). */
export interface InlineStart {
  id: InlineActionId;
}

interface Props {
  selection: InlineSelection;
  start?: InlineStart;
  notePath: string;
  /** Why the AI cannot be used now; the menu then says so instead of running. */
  aiOff?: string | null;
  /** Called with the replacement text when the user accepts. */
  onAccept: (replacement: string, commandLabel: string) => void;
  /** "Find tasks in it": the selected text is handed to the task finder. */
  onFindTasks: (text: string) => void;
  onClose: () => void;
}

type Phase = "choose" | "running" | "review";

const GROUPS: { label: string; ids: InlineActionId[] }[] = [
  { label: "Change the text", ids: ["fix", "clearer", "shorten", "list"] },
  { label: "Rewrite, same meaning", ids: ["simpler", "formal", "friendly"] },
  { label: "Translate", ids: ["toDanish", "toEnglish"] },
  { label: "Use the text", ids: ["explain", "findTasks"] },
];

/**
 * The AI popup at a selection: choose a fixed command, see the result, and accept or reject it.
 * A changed text is shown as a diff, with a check that its numbers, links and names are still
 * there. "Explain this" only shows an answer; nothing in the note changes.
 */
export function InlineAiPopup({
  selection,
  start,
  notePath,
  aiOff = null,
  onAccept,
  onFindTasks,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<InlineAction | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const now = useNow(phase === "running");
  const taskId = useRef<string | null>(null);
  const raw = useRef("");

  const run = useCallback(
    async (a: InlineAction) => {
      if (a.id === "findTasks") {
        onFindTasks(selection.text);
        return;
      }
      setAction(a);
      setStartedAt(Date.now());
      setPhase("running");
      setError(null);
      setResult("");
      raw.current = "";
      try {
        taskId.current = await api.aiInline(
          {
            command: a.command,
            instruction: a.instruction,
            text: selection.text,
            notePath,
            providerId: null,
          },
          (e) => {
            if (e.type === "textDelta") {
              raw.current += e.text;
              setResult(raw.current);
            } else if (e.type === "error") {
              setError(e.error.message);
              setPhase("choose");
            } else if (e.type === "done") {
              setResult(stripCodeFence(raw.current).trim());
              setPhase((p) => (p === "running" ? "review" : p));
            }
          },
        );
      } catch (e) {
        setError(toApiError(e).message);
        setPhase("choose");
      }
    },
    [notePath, selection.text, onFindTasks],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || aiOff !== null) return;
    started.current = true;
    const a = inlineAction(start.id);
    if (a) void run(a);
  }, [start, run, aiOff]);

  const close = useCallback(() => {
    if (taskId.current !== null) void api.aiCancel(taskId.current).catch(() => undefined);
    onClose();
  }, [onClose]);

  const answerOnly = action?.answer === true;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter" && phase === "review" && !answerOnly && !e.shiftKey) {
        e.preventDefault();
        onAccept(result, action?.label ?? "AI");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [close, onAccept, phase, result, action, answerOnly]);

  // A click anywhere else closes the menu (the result of a command is kept until you answer it).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "choose") return;
    const onDown = (e: MouseEvent): void => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) close();
    };
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [phase, close]);

  const left = Math.max(8, Math.min(selection.x, window.innerWidth - 480));
  const top = Math.min(selection.y + 24, window.innerHeight - 420);
  const lost = phase === "review" && !answerOnly ? missingFacts(selection.text, result) : [];
  const hadFacts = factsOf(selection.text).length > 0;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="AI command"
      className="fixed z-40 w-[460px] max-w-[94vw] rounded-lg border bg-card p-2 shadow-xl"
      style={{ left, top: Math.max(8, top) }}
    >
      {phase === "choose" && (
        <div className="flex max-h-[70vh] flex-col overflow-auto">
          <div className="flex items-center px-2 pt-0.5">
            <span className="flex-1 text-xs font-semibold">AI</span>
            <button
              type="button"
              aria-label="Close the menu"
              className="rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onClick={close}
            >
              <X className="size-3.5" />
            </button>
          </div>
          {aiOff !== null && <AiOffNote reason={aiOff} />}
          {error !== null && <p className="px-2 py-1 text-xs text-destructive">{error}</p>}
          {GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col">
              <span className="px-2 pb-0.5 pt-2 section-label">{g.label}</span>
              {g.ids
                .map((id) => INLINE_ACTIONS.find((a) => a.id === id))
                .filter((a): a is InlineAction => a !== undefined)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={aiOff !== null}
                    className="flex items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                    onClick={() => void run(a)}
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{a.hint}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      {(phase === "running" || phase === "review") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {phase === "running" && <Loader2 className="size-3.5 animate-spin" />}
            <span className="font-semibold text-foreground">{action?.label}</span>
            {phase === "running" && (
              <span aria-hidden className="tabular-nums">
                {Math.max(0, Math.floor((now - startedAt) / 1000))} s
              </span>
            )}
            {phase === "review" && !answerOnly && hadFacts && (
              <span
                role="status"
                className={cn(
                  "ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5",
                  lost.length > 0 && "border-warning bg-warning/10 text-foreground",
                )}
              >
                {lost.length === 0 ? (
                  <>
                    <ShieldCheck className="size-3.5 text-success" aria-hidden /> Same numbers,
                    links and names
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5" aria-hidden /> Check: {lost.join(", ")}{" "}
                    {lost.length === 1 ? "is" : "are"} gone
                  </>
                )}
              </span>
            )}
          </div>
          <div className="max-h-64 overflow-auto rounded border">
            {phase === "review" && !answerOnly ? (
              <DiffView original={selection.text} modified={result} />
            ) : (
              <p className="whitespace-pre-wrap p-2 text-sm">{result || "…"}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              <X /> {answerOnly ? "Close" : "Reject"}{" "}
              <kbd className="text-[10px] opacity-60">Esc</kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={phase === "running" || action === null}
              onClick={() => {
                if (action) void run(action);
              }}
            >
              <RotateCcw /> Try again
            </Button>
            {answerOnly ? (
              <Button
                size="sm"
                disabled={phase === "running" || result === ""}
                onClick={() => {
                  void navigator.clipboard.writeText(result).catch(() => undefined);
                }}
              >
                <Copy /> Copy
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={phase === "running" || result === ""}
                onClick={() => {
                  onAccept(result, action?.label ?? "AI");
                }}
              >
                <Check /> Accept <kbd className="text-[10px] opacity-70">Enter</kbd>
              </Button>
            )}
          </div>
          {!answerOnly && (
            <p className="text-[11px] text-muted-foreground">
              Your note is saved first, so it can be undone from History.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
