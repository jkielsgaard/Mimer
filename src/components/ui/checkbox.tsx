import * as React from "react";

/** A checkbox. Every tick box in Mimer is this, so a change to how they look is made once. */
export function Checkbox(props: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" {...props} />;
}
