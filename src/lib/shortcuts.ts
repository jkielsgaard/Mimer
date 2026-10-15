import { useEffect } from "react";

export const isMac =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);

/** True when the event matches a combo like "Mod+Shift+F" (Mod = Ctrl, or Cmd on macOS). */
export function matchShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+");
  const key = (parts.pop() ?? "").toLowerCase();
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (want.has("mod") !== mod) return false;
  if (want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

/** Human-readable combo for menus. */
export function formatShortcut(combo: string): string {
  return combo.replace("Mod", isMac ? "⌘" : "Ctrl");
}

/** Registers global shortcuts for the lifetime of the component. */
export function useShortcuts(bindings: Record<string, () => void>): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      for (const [combo, action] of Object.entries(bindings)) {
        if (matchShortcut(e, combo)) {
          e.preventDefault();
          action();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [bindings]);
}
