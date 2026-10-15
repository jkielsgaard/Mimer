import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { reportError } from "@/stores/uiStore";

/** True for places where the system menu (copy, paste, spelling) is useful. */
function isTextField(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.closest("input, textarea, [contenteditable='true']") !== null || el.isContentEditable)
  );
}

/**
 * Replaces the web view's own right-click menu (Back, Reload…) with one entry, Inspect element.
 * Menus the app draws itself (file tree, editor) are left alone, and so are text fields.
 */
export function AppContextMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onContext = (e: MouseEvent): void => {
      if (e.defaultPrevented || isTextField(e.target)) return;
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    };
    const close = (): void => {
      setAt(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, []);

  if (at === null) return null;
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-40 rounded-md border bg-card p-1 text-sm shadow-lg"
      style={{ left: at.x, top: at.y }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
        onClick={() => {
          setAt(null);
          api.openDevtools().catch(reportError);
        }}
      >
        Inspect element
      </button>
    </div>
  );
}
