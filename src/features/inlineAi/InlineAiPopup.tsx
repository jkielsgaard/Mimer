import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InlineCommand } from "@/bindings/InlineCommand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, toApiError } from "@/lib/api";
import { stripCodeFence } from "@/lib/fence";
import { useNow } from "@/features/chat/useNow";
import { DiffView } from "@/components/DiffView";

export interface InlineSelection {
  from: number;
  to: number;
  text: string;
  /** Viewport position of the selection start. */
  x: number;
  y: number;
}

const COMMANDS: { id: InlineCommand; label: string }[] = [
  { id: "fixSpelling", label: "Fix spelling and grammar" },
  { id: "rewrite", label: "Rewrite clearer" },
  { id: "shorten", label: "Shorten" },
  { id: "expand", label: "Expand" },
  { id: "restructureList", label: "Restructure as list" },
  { id: "custom", label: "Custom…" },
];

/** A command to start at once when the popup opens (from the bubble over a selection). */
export type InlineStart = { id: Exclude<InlineCommand, "custom"> } | { id: "custom" };

interface Props {
  selection: InlineSelection;
  start?: InlineStart;
  notePath: string;
  /** Called with the replacement text when the user accepts. */
  onAccept: (replacement: string, commandLabel: string) => void;
  onClose: () => void;
}

type Phase = "choose" | "custom" | "running" | "review";

/** Mod+K popup: choose a command, stream the result, review the diff, accept or reject. */
export function InlineAiPopup({ selection, start, notePath, onAccept, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const now = useNow(phase === "running");
  const lastCommand = useRef<{
    id: InlineCommand;
    instruction: string | null;
    label: string;
  } | null>(null);
  const taskId = useRef<string | null>(null);
  const raw = useRef("");

  const run = useCallback(
    async (id: InlineCommand, instr: string | null, lbl: string) => {
      lastCommand.current = { id, instruction: instr, label: lbl };
      setLabel(lbl);
      setStartedAt(Date.now());
      setPhase("running");
      setError(null);
      setResult("");
      raw.current = "";
      try {
        taskId.current = await api.aiInline(
          {
            command: id,
            instruction: instr,
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
              setResult(stripCodeFence(raw.current));
              setPhase((p) => (p === "running" ? "review" : p));
            }
          },
        );
      } catch (e) {
        setError(toApiError(e).message);
        setPhase("choose");
      }
    },
    [notePath, selection.text],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    if (start.id === "custom") {
      setPhase("custom");
      return;
    }
    const c = COMMANDS.find((x) => x.id === start.id);
    if (c) void run(c.id, null, c.label);
  }, [start, run]);

  const close = useCallback(() => {
    if (taskId.current !== null) void api.aiCancel(taskId.current).catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter" && phase === "review" && !e.shiftKey) {
        e.preventDefault();
        onAccept(result, label);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [close, onAccept, phase, result, label]);

  const left = Math.max(8, Math.min(selection.x, window.innerWidth - 480));
  const top = Math.min(selection.y + 24, window.innerHeight - 340);

  return (
    <div
      role="dialog"
      aria-label="AI command"
      className="fixed z-40 w-[460px] max-w-[94vw] rounded-lg border bg-card p-2 shadow-xl"
      style={{ left, top: Math.max(8, top) }}
    >
      {phase === "choose" && (
        <div className="flex flex-col">
          {error !== null && <p className="px-2 py-1 text-xs text-destructive">{error}</p>}
          {COMMANDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                if (c.id === "custom") setPhase("custom");
                else void run(c.id, null, c.label);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {phase === "custom" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim() !== "") void run("custom", instruction.trim(), "Custom");
          }}
        >
          <Input
            autoFocus
            value={instruction}
            placeholder="What should the AI do with the selection?"
            onChange={(e) => {
              setInstruction(e.target.value);
            }}
          />
          <Button type="submit">Run</Button>
        </form>
      )}
      {(phase === "running" || phase === "review") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {phase === "running" && <Loader2 className="size-3.5 animate-spin" />}
            <span>{label}</span>
            {phase === "running" && (
              <span aria-hidden className="tabular-nums">
                {Math.max(0, Math.floor((now - startedAt) / 1000))} s
              </span>
            )}
          </div>
          <div className="max-h-64 overflow-auto rounded border">
            {phase === "review" ? (
              <DiffView original={selection.text} modified={result} />
            ) : (
              <pre className="whitespace-pre-wrap p-2 text-sm">{result || "…"}</pre>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              <X /> Reject <kbd className="text-[10px] opacity-60">Esc</kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={phase === "running"}
              onClick={() => {
                const last = lastCommand.current;
                if (last) void run(last.id, last.instruction, last.label);
              }}
            >
              <RotateCcw /> Retry
            </Button>
            <Button
              size="sm"
              disabled={phase === "running" || result === ""}
              onClick={() => {
                onAccept(result, label);
              }}
            >
              <Check /> Accept <kbd className="text-[10px] opacity-70">Enter</kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
