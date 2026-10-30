import * as React from "react";

/** A radio button. Every one in Mimer is this, so a change to how they look is made once. */
export function Radio(props: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="radio" {...props} />;
}
