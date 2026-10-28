import * as React from "react";
import { indentKey } from "@/lib/indentText";
import { cn } from "@/lib/utils";

/**
 * A text box. `indent` is for boxes where notes are written: Tab and Shift+Tab then move lines in
 * and out as in the note editor, instead of moving to the next field.
 */
export function Textarea({
  className,
  indent = false,
  onKeyDown,
  ...props
}: React.ComponentProps<"textarea"> & { indent?: boolean }) {
  return (
    <textarea
      className={cn(
        "min-h-16 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      onKeyDown={(e) => {
        if (indent) indentKey(e);
        if (!e.defaultPrevented) onKeyDown?.(e);
      }}
      {...props}
    />
  );
}
