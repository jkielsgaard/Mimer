import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUiStore } from "@/stores/uiStore";

interface Props {
  /** The short explanation shown in the bubble. */
  text: string;
  /** What the hint is about; used as the button's name for screen readers. */
  label: string;
  /** A topic of the how-to guide; adds a "Read more" link to it. */
  topic?: string;
}

const WIDTH = 260;

/**
 * A small "?" that explains something. Point at it, focus it with the keyboard, or click it to
 * show the text; Esc, moving away or clicking elsewhere hides it. With `topic` it also links to the how-to guide.
 */
export function InfoHint({ text, label, topic }: Props) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = (): void => {
    if (timer.current) clearTimeout(timer.current);
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - 8,
    );
    setPos({ left, top: r.bottom + 6 });
  };
  const hideSoon = (): void => {
    // A short delay lets the pointer travel from the "?" to the bubble (to click "Read more").
    timer.current = setTimeout(() => {
      setPos(null);
    }, 150);
  };

  useEffect(() => {
    if (pos === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPos(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pos]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`About: ${label}`}
        aria-describedby={pos ? id : undefined}
        className="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        // A click keeps it open (also on touch screens); Esc, moving away or clicking elsewhere hides it.
        onClick={(e) => {
          e.preventDefault();
          show();
        }}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      {pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
            className="fixed z-[200] rounded-md border bg-card p-2.5 text-xs leading-snug text-card-foreground shadow-lg"
            onMouseEnter={show}
            onMouseLeave={hideSoon}
          >
            <p>{text}</p>
            {topic && (
              <button
                type="button"
                className="mt-1.5 text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setPos(null);
                  useUiStore.getState().openHelp(topic);
                }}
              >
                Read more in the guide
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
