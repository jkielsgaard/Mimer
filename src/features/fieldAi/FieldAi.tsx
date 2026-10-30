import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  InlineAiPopup,
  type InlineSelection,
  type InlineStart,
} from "@/features/inlineAi/InlineAiPopup";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { formatShortcut } from "@/lib/shortcuts";
import { useVaultStore } from "@/stores/vaultStore";
import { aiField, fieldRange, replaceInField, type TextField } from "./fieldText";
import { PlainButton } from "@/components/ui/plain-button";

/** The least text that is worth offering the AI for (a stray double click is not). */
const MIN_CHARS = 3;

const QUICK: { label: string; title: string; start: InlineStart }[] = [
  { label: "Fix", title: "Fix spelling and grammar", start: { id: "fix" } },
  { label: "Rewrite", title: "Rewrite clearer, same meaning", start: { id: "clearer" } },
  { label: "Shorten", title: "Shorten, keeping every fact", start: { id: "shorten" } },
];

interface Open {
  el: TextField;
  start?: InlineStart;
  selection: InlineSelection;
}

/**
 * The AI in every text box of the app. Select text in a box and a small bar offers the usual
 * commands; Ctrl+K works on the selection, or on all the text when nothing is selected. The same
 * commands and the same review as in a note (spelling, rewriting, translating). Nothing is
 * sent until a command is chosen, and nothing changes until the result is accepted.
 */
export function FieldAi() {
  const aiOff = useAiBlocked();
  const [bar, setBar] = useState<{ el: TextField; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const show = (e: Event): void => {
      const el = aiField(e.target);
      if (openRef.current !== null) return;
      if (el === null) {
        // A click outside the box puts the bar away, but not a click on the bar itself.
        if (!(e.target instanceof Element) || e.target.closest("[data-field-ai]") === null) {
          setBar(null);
        }
        return;
      }
      const a = el.selectionStart ?? 0;
      const b = el.selectionEnd ?? 0;
      if (b - a < MIN_CHARS || el.value.slice(a, b).trim() === "") {
        setBar(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setBar({ el, x: r.left, y: r.top });
    };
    // A press on the bar itself must not remove it, or the click never reaches its button.
    const clear = (e: Event): void => {
      if (e.target instanceof Element && e.target.closest("[data-field-ai]") !== null) return;
      setBar(null);
    };
    const key = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "k") {
        return;
      }
      const el = aiField(e.target);
      if (el === null) return;
      e.preventDefault();
      e.stopPropagation();
      const range = fieldRange(el);
      if (range === null) return;
      const r = el.getBoundingClientRect();
      setBar(null);
      setOpen({
        el,
        selection: {
          from: range.from,
          to: range.to,
          text: el.value.slice(range.from, range.to),
          x: r.left,
          y: r.bottom - 24,
        },
      });
    };
    document.addEventListener("mouseup", show, true);
    document.addEventListener("keyup", show, true);
    document.addEventListener("mousedown", clear, true);
    document.addEventListener("scroll", clear, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mouseup", show, true);
      document.removeEventListener("keyup", show, true);
      document.removeEventListener("mousedown", clear, true);
      document.removeEventListener("scroll", clear, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);

  const choose = (start: InlineStart | undefined): void => {
    if (bar === null) return;
    const range = fieldRange(bar.el);
    if (range === null) return;
    setOpen({
      el: bar.el,
      start,
      selection: {
        from: range.from,
        to: range.to,
        text: bar.el.value.slice(range.from, range.to),
        x: bar.x,
        y: bar.y - 8,
      },
    });
    setBar(null);
  };

  return (
    <>
      {bar !== null && open === null && (
        <div
          role="toolbar"
          data-field-ai
          aria-label="AI commands for the selected text"
          className="fixed z-[60] flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-lg"
          style={{
            left: Math.max(8, Math.min(bar.x, window.innerWidth - 340)),
            top: Math.max(8, bar.y - 40),
          }}
          onMouseDown={(e) => {
            // Keep the selection while a button is pressed.
            e.preventDefault();
          }}
        >
          <Sparkles className="mx-1.5 size-3.5 text-primary" aria-hidden />
          {QUICK.map((a) => (
            <PlainButton
              key={a.label}
              type="button"
              disabled={aiOff !== null}
              title={aiOff ?? a.title}
              className="rounded px-2 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:hover:bg-transparent"
              onClick={() => {
                choose(a.start);
              }}
            >
              {a.label}
            </PlainButton>
          ))}
          <PlainButton
            type="button"
            aria-label="More AI commands"
            title={aiOff ?? "More AI commands: rewrite, translate, explain"}
            className="flex items-center gap-0.5 rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              choose(undefined);
            }}
          >
            AI <ChevronDown className="size-3" aria-hidden />
          </PlainButton>
          <kbd className="mx-1 rounded border px-1 text-[10px] text-muted-foreground">
            {formatShortcut("Mod+K")}
          </kbd>
        </div>
      )}
      {open !== null && (
        <InlineAiPopup
          selection={open.selection}
          start={open.start}
          notePath={useVaultStore.getState().activePath}
          allowFindTasks={false}
          aiOff={aiOff}
          onFindTasks={() => undefined}
          onAccept={(text) => {
            replaceInField(open.el, open.selection.from, open.selection.to, text);
            setOpen(null);
          }}
          onClose={() => {
            open.el.focus();
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
