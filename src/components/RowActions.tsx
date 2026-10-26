import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The pencil and the waste bin of a row. They show when the pointer is over the row or the focus
 * is in it (the row needs the `group` class), so the text is never a field you can hit by
 * accident. `what` names the thing ("the task Book the room") for the screen reader.
 */
export function RowActions({
  what,
  onEdit,
  onDelete,
  className,
}: {
  what: string;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
    >
      {onEdit && (
        <button type="button" aria-label={`Edit ${what}`} className={BUTTON} onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${what}`}
          className={cn(BUTTON, "hover:text-destructive")}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

/**
 * The field that opens when the pencil is pressed. Enter or the tick saves, Escape or the cross
 * goes back. Leaving the field changes nothing.
 */
export function InlineEdit({
  value,
  label,
  onSave,
  onCancel,
  className,
}: {
  value: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const save = (): void => {
    const v = text.trim();
    if (v === "" || v === value) onCancel();
    else onSave(v);
  };
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        ref={input}
        aria-label={label}
        value={text}
        className={cn(
          "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="submit" aria-label="Save" className={BUTTON}>
        <Check className="size-3.5" aria-hidden />
      </button>
      <button type="button" aria-label="Cancel" className={BUTTON} onClick={onCancel}>
        <X className="size-3.5" aria-hidden />
      </button>
    </form>
  );
}
