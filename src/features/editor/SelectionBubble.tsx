import type { EditorView } from "@codemirror/view";
import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import type { InlineStart } from "@/features/inlineAi/InlineAiPopup";
import { formatShortcut } from "@/lib/shortcuts";

const ACTIONS: { label: string; title: string; start: InlineStart }[] = [
  { label: "Fix", title: "Fix spelling and grammar", start: { id: "fix" } },
  { label: "Rewrite", title: "Rewrite clearer, same meaning", start: { id: "clearer" } },
  { label: "Shorten", title: "Shorten, keeping every fact", start: { id: "shorten" } },
];

/** The least text that is worth offering the AI for (a stray double click is not). */
const MIN_CHARS = 3;

/**
 * A small bar over selected text with the usual AI commands. It is the same as pressing the
 * shortcut for inline commands, only easier to find. Nothing is sent until a command is chosen.
 */
export function SelectionBubble({
  host,
  viewRef,
  hidden,
  aiOff = null,
  onChoose,
  onCapture,
}: {
  host: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<EditorView | null>;
  hidden: boolean;
  /** Why the AI cannot be used now: its buttons are then off, and say why. */
  aiOff?: string | null;
  /** A command to start, or `undefined` to open the menu of all AI commands. */
  onChoose: (start: InlineStart | undefined) => void;
  /** Writes the selected text down as a task or an idea. */
  onCapture?: (kind: "task" | "idea") => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = (): void => {
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      if (sel.empty || sel.to - sel.from < MIN_CHARS) {
        setAt(null);
        return;
      }
      const coords = view.coordsAtPos(sel.from);
      setAt(coords ? { x: coords.left, y: coords.top } : null);
    };
    const clear = (): void => {
      setAt(null);
    };
    el.addEventListener("mouseup", update);
    el.addEventListener("keyup", update);
    el.addEventListener("scroll", clear, true);
    el.addEventListener("mousedown", clear);
    return () => {
      el.removeEventListener("mouseup", update);
      el.removeEventListener("keyup", update);
      el.removeEventListener("scroll", clear, true);
      el.removeEventListener("mousedown", clear);
    };
  }, [host, viewRef]);

  if (hidden || at === null) return null;
  return (
    <div
      role="toolbar"
      aria-label="AI commands for the selected text"
      className="fixed z-30 flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-lg"
      style={{
        left: Math.max(8, Math.min(at.x, window.innerWidth - 340)),
        top: Math.max(8, at.y - 40),
      }}
      onMouseDown={(e) => {
        // Keep the selection while a button is pressed.
        e.preventDefault();
      }}
    >
      <Sparkles className="mx-1.5 size-3.5 text-primary" aria-hidden />
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={aiOff !== null}
          title={aiOff ?? a.title}
          className="rounded px-2 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:bg-transparent"
          onClick={() => {
            setAt(null);
            onChoose(a.start);
          }}
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        aria-label="More AI commands"
        title={aiOff ?? "More AI commands: rewrite, translate, explain, find tasks"}
        className="flex items-center gap-0.5 rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setAt(null);
          onChoose(undefined);
        }}
      >
        AI <ChevronDown className="size-3" aria-hidden />
      </button>
      {onCapture && (
        <>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {(["task", "idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="rounded px-2 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setAt(null);
                onCapture(k);
              }}
            >
              {k === "task" ? "As a task" : "As an idea"}
            </button>
          ))}
        </>
      )}
      <kbd className="mx-1 rounded border px-1 text-[10px] text-muted-foreground">
        {formatShortcut("Mod+K")}
      </kbd>
    </div>
  );
}
