import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { SpellMark } from "./extensions/aiSpelling";

/** The small box under a marked word: use the AI's spelling, leave it, or never mark it again. */
export function SpellPopover({
  mark,
  x,
  y,
  others,
  onReplace,
  onIgnore,
  onAddWord,
  onFixAll,
  onClose,
}: {
  mark: SpellMark;
  x: number;
  y: number;
  /** How many marked words the note has in all. */
  others: number;
  onReplace: () => void;
  onIgnore: () => void;
  onAddWord: () => void;
  onFixAll: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Spelling of ${mark.wrong}`}
      className="fixed z-40 flex w-72 flex-col gap-2 rounded-lg border bg-card p-3 shadow-xl"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 300)), top: y + 6 }}
    >
      <span className="text-[11px] text-muted-foreground">Did you mean</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" className="text-sm" onClick={onReplace}>
          {mark.right}
        </Button>
        <Button size="sm" variant="outline" onClick={onIgnore}>
          Ignore
        </Button>
        <Button size="sm" variant="ghost" onClick={onAddWord}>
          Add to my words
        </Button>
      </div>
      {others > 1 && (
        <Button size="sm" variant="ghost" className="justify-start" onClick={onFixAll}>
          Fix all {others} marked words
        </Button>
      )}
    </div>
  );
}
