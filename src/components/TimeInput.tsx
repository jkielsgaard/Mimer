import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { menuContent } from "@/components/ui/menuStyles";
import { PlainButton } from "@/components/ui/plain-button";
import { formatTime, parseTime, resolveTimeFormat } from "@/lib/timeFormat";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

/** Every quarter of an hour of the day, `00:00` to `23:45`. */
const QUARTERS: readonly string[] = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

/** The time the list shows when the box is empty. */
const EMPTY_AT = "09:00";

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The quarter of an hour closest to a time. */
function nearestQuarter(hhmm: string): string {
  const at = minutes(hhmm);
  return QUARTERS.reduce((best, q) =>
    Math.abs(minutes(q) - at) < Math.abs(minutes(best) - at) ? q : best,
  );
}

/**
 * A time written in the way chosen in Settings (24-hour or 12-hour), or picked from a list of
 * every quarter of an hour. It reads `14:30`, `1430`, `2:30 pm` and so on, and hands on `HH:MM`
 * (or "" when the box is empty). A time that cannot be read is marked and is not handed on; a time
 * that is not on the list is fine.
 */
export function TimeInput({
  id,
  value,
  onChange,
  onValid,
}: {
  id: string;
  /** `HH:MM`, or "". */
  value: string;
  onChange: (hhmm: string) => void;
  /** Told whether the text in the box can be read, so a form can refuse to save a wrong time. */
  onValid?: (ok: boolean) => void;
}) {
  const format = useUiStore((s) => s.timeFormat);
  const [text, setText] = useState(() => formatTime(value, format));
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  /** The row the arrow keys are on, or null. */
  const [active, setActive] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  /** The last time this box handed on, so its own change does not rewrite what is being typed. */
  const handedOn = useRef(value);

  // The time is set from outside (the window opens with another time).
  useEffect(() => {
    if (value === handedOn.current) return;
    handedOn.current = value;
    setText(formatTime(value, format));
    setBad(false);
  }, [value, format]);

  // The format is changed in Settings.
  useEffect(() => {
    setText(formatTime(handedOn.current, format));
  }, [format]);

  const shown = parseTime(text) ?? EMPTY_AT;
  const near = useMemo(() => nearestQuarter(shown), [shown]);

  // A click outside the box closes the list.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);

  // The list opens at the time that is in the box (or 09:00).
  useEffect(() => {
    if (!open || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-time="${near}"]`);
    if (row) list.current.scrollTop = row.offsetTop - list.current.clientHeight / 2;
  }, [open, near]);

  const pick = (hhmm: string): void => {
    handedOn.current = hhmm;
    setText(formatTime(hhmm, format));
    setBad(false);
    onValid?.(true);
    onChange(hhmm);
    setOpen(false);
    setActive(null);
  };

  const move = (step: number): void => {
    const from = QUARTERS.indexOf(active ?? near);
    const next = Math.min(QUARTERS.length - 1, Math.max(0, from + (active === null ? 0 : step)));
    setActive(QUARTERS[next] ?? near);
    setOpen(true);
    const row = list.current?.querySelector<HTMLElement>(`[data-time="${QUARTERS[next] ?? ""}"]`);
    if (row && list.current) {
      const top = row.offsetTop;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (top + row.offsetHeight > list.current.scrollTop + list.current.clientHeight) {
        list.current.scrollTop = top + row.offsetHeight - list.current.clientHeight;
      }
    }
  };

  return (
    <div ref={box} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="none"
        aria-activedescendant={open && active !== null ? `${id}-${active}` : undefined}
        inputMode="text"
        autoComplete="off"
        className="pr-8"
        placeholder={resolveTimeFormat(format) === "12" ? "2:30 PM" : "14:30"}
        aria-invalid={bad}
        value={text}
        onClick={() => {
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && open && active !== null) {
            // Enter picks the row the arrows are on; without one it goes on to the form.
            e.preventDefault();
            pick(active);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setActive(null);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          setActive(null);
          setOpen(true);
          if (t.trim() === "") {
            setBad(false);
            onValid?.(true);
            handedOn.current = "";
            onChange("");
            return;
          }
          const parsed = parseTime(t);
          setBad(parsed === null);
          onValid?.(parsed !== null);
          if (parsed !== null) {
            handedOn.current = parsed;
            onChange(parsed);
          }
        }}
        onBlur={() => {
          setText(formatTime(handedOn.current, format));
          setBad(false);
          onValid?.(true);
        }}
      />
      <PlainButton
        tabIndex={-1}
        aria-label="Choose a time"
        className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        // The box keeps the focus, so a click here does not make it write the time again.
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </PlainButton>
      {open && (
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label="Times"
          className={cn(
            menuContent,
            "absolute left-0 top-full mt-1 max-h-56 w-full min-w-28 overflow-auto",
          )}
          // Keep the focus in the box while a row is clicked.
          onMouseDown={(e) => {
            e.preventDefault();
          }}
        >
          {QUARTERS.map((q) => {
            const exact = q === handedOn.current;
            return (
              <div
                key={q}
                id={`${id}-${q}`}
                role="option"
                aria-selected={exact}
                data-time={q}
                className={cn(
                  "cursor-pointer rounded px-2 py-1",
                  active === q && "bg-accent",
                  exact && "bg-accent font-semibold text-accent-foreground",
                  !exact && q === near && active === null && "bg-muted",
                )}
                onClick={() => {
                  pick(q);
                }}
              >
                {formatTime(q, format)}
                {exact && <span aria-hidden> ✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
