import type { EditorView } from "@codemirror/view";
import { useEffect } from "react";
import { reportError } from "@/stores/uiStore";

/** One line of the menu: the shortcut stays on the right. */
function Item({
  label,
  keys,
  disabled,
  onClick,
}: {
  label: string;
  keys?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center gap-6 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
      onClick={onClick}
    >
      <span>{label}</span>
      {keys && <span className="ml-auto text-xs text-muted-foreground">{keys}</span>}
    </button>
  );
}

/**
 * The right-click menu on selected text: the usual Cut, Copy, Paste and Select all first, then
 * one line for the AI, and the two ways to write the selection down. (Without a selection the
 * system's own menu is shown instead.)
 */
export function EditorContextMenu({
  at,
  view,
  aiOff,
  onAi,
  onCapture,
  onClose,
}: {
  at: { x: number; y: number };
  view: EditorView;
  /** Why the AI cannot be used now, or null. */
  aiOff: string | null;
  onAi: () => void;
  onCapture: (kind: "task" | "idea") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const selection = (): string => {
    const s = view.state.selection.main;
    return view.state.sliceDoc(s.from, s.to);
  };
  const done = (): void => {
    onClose();
    view.focus();
  };
  const copy = (): void => {
    navigator.clipboard.writeText(selection()).catch(reportError);
    done();
  };
  const cut = (): void => {
    const s = view.state.selection.main;
    navigator.clipboard
      .writeText(selection())
      .then(() => {
        view.dispatch({ changes: { from: s.from, to: s.to, insert: "" } });
      })
      .catch(reportError);
    done();
  };
  const paste = (): void => {
    navigator.clipboard
      .readText()
      .then((text) => {
        view.dispatch(view.state.replaceSelection(text));
      })
      .catch(reportError);
    done();
  };
  const selectAll = (): void => {
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    done();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        aria-hidden
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        aria-label="Text"
        className="fixed z-50 min-w-56 rounded-md border bg-card p-1 shadow-lg"
        style={{ left: at.x, top: at.y }}
      >
        <Item label="Cut" keys="Ctrl+X" onClick={cut} />
        <Item label="Copy" keys="Ctrl+C" onClick={copy} />
        <Item label="Paste" keys="Ctrl+V" onClick={paste} />
        <Item label="Select all" keys="Ctrl+A" onClick={selectAll} />
        <div role="separator" className="my-1 h-px bg-border" />
        <Item
          label="AI ›"
          keys="Ctrl+K"
          disabled={aiOff !== null}
          onClick={() => {
            onClose();
            onAi();
          }}
        />
        <div role="separator" className="my-1 h-px bg-border" />
        <Item
          label="Add as a task"
          onClick={() => {
            onCapture("task");
            done();
          }}
        />
        <Item
          label="Add as an idea"
          onClick={() => {
            onCapture("idea");
            done();
          }}
        />
      </div>
    </>
  );
}
