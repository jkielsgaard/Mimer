import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent } from "react";

type Move = () => Promise<void> | void;

/** After a move the row is drawn again; the focus goes back to its move button. */
function moved(label: string, up: boolean, run: Move): void {
  // At the top (or bottom) the button just used is disabled, so the other one gets the focus.
  const names = [`Move ${label} ${up ? "up" : "down"}`, `Move ${label} ${up ? "down" : "up"}`];
  void Promise.resolve(run()).then(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    for (const name of names) {
      const button = buttons.find((b) => b.getAttribute("aria-label") === name && !b.disabled);
      if (button) {
        button.focus();
        return;
      }
    }
  });
}

/** Alt+Up / Alt+Down on a row: the same moves as the buttons. Returns true when it moved. */
export function moveKey(
  e: KeyboardEvent,
  label: string,
  can: { up: boolean; down: boolean },
  onUp: Move,
  onDown: Move,
): boolean {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return false;
  e.preventDefault();
  e.stopPropagation();
  const up = e.key === "ArrowUp";
  if (up ? can.up : can.down) moved(label, up, up ? onUp : onDown);
  return true;
}

/**
 * Two small buttons that move an item one place up or down (also Alt+Up / Alt+Down on its row).
 * They show on the row under the mouse or with the keyboard focus, like Focus in the task list.
 */
export function MoveButtons({
  label,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  /** What is moved, for the button names ("Move Call Mette up"). */
  label: string;
  canUp: boolean;
  canDown: boolean;
  onUp: Move;
  onDown: Move;
}) {
  const button =
    "rounded p-0.5 text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:invisible";
  return (
    <span className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        title="Move up (Alt+Up)"
        disabled={!canUp}
        className={button}
        onClick={() => {
          moved(label, true, onUp);
        }}
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        title="Move down (Alt+Down)"
        disabled={!canDown}
        className={button}
        onClick={() => {
          moved(label, false, onDown);
        }}
      >
        <ChevronDown className="size-4" />
      </button>
    </span>
  );
}
