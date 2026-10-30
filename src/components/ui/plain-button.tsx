import * as React from "react";

/**
 * A button with its own look, for the places where the look is part of the row or bar it sits in
 * (a list row, a chip, a tab, a rail icon). It is a plain `<button type="button">`; anything every
 * such button should have is added here, once. A button that looks like a button is `Button`.
 */
export function PlainButton({ type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} {...props} />;
}
