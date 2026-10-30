import * as React from "react";

/**
 * A one-line field that sits inside a row or a list without a box of its own until it is used:
 * "+ Add a step", "+ Add a task", renaming in place, the file filter. A field in a form is `Input`.
 */
export function InlineInput(props: React.ComponentProps<"input">) {
  return <input {...props} />;
}
