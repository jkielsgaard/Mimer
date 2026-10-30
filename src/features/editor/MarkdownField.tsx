import { closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { editorTheme } from "./editorTheme";
import { toggleWrap } from "./extensions/commands";
import { listIndent } from "./extensions/listIndent";
import { livePreview } from "./extensions/livePreview";

/**
 * How the box is made smaller than the note editor: no page width, no big padding, the height
 * follows the text between `rows` lines and `maxRows`.
 */
function fieldTheme(rows: number, maxRows: number) {
  return EditorView.theme({
    "&": { height: "auto", backgroundColor: "transparent", fontSize: "14px" },
    ".cm-scroller": { maxHeight: `${String(maxRows * 1.65)}em`, overflow: "auto" },
    ".cm-content": {
      maxWidth: "none",
      margin: "0",
      padding: "6px 10px",
      minHeight: `${String(rows * 1.65)}em`,
    },
    ".cm-placeholder": { color: "var(--muted-foreground)" },
  });
}

export interface MarkdownFieldProps {
  /** The text. The box keeps its own cursor; a new value from outside replaces what is in it. */
  value: string;
  onChange?: (text: string) => void;
  /** The box was left. */
  onBlur?: (text: string) => void;
  /** What saves from the keyboard: `enter` (Shift+Enter is a new line), `mod-enter`, or nothing. */
  submitKey?: "enter" | "mod-enter";
  onSubmit?: (text: string) => void;
  /** Esc was pressed. */
  onEscape?: () => void;
  /** One line only: a new line cannot be written (it would be lost where the text is kept). */
  singleLine?: boolean;
  placeholder?: string;
  /** The name of the box for a screen reader, and for finding it. */
  label: string;
  autoFocus?: boolean;
  rows?: number;
  maxRows?: number;
  className?: string;
}

/**
 * A text box for text of more than one line (a note, a log line, the notes of a meeting). It is the
 * note editor in a small box: Markdown with live preview, lists, Tab and Shift+Tab, Ctrl/Cmd+B and
 * Ctrl/Cmd+I. A box for one line (a title, a task, a step) is `Input`, not this.
 */
export function MarkdownField({
  value,
  onChange,
  onBlur,
  submitKey,
  onSubmit,
  onEscape,
  singleLine = false,
  placeholder,
  label,
  autoFocus = false,
  rows = 3,
  maxRows = 12,
  className,
}: MarkdownFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The newest callbacks, read when a key or an event happens, so the view is made only once.
  const props = useRef({ onChange, onBlur, onSubmit, onEscape, submitKey });
  props.current = { onChange, onBlur, onSubmit, onEscape, submitKey };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const text = (v: EditorView): string => v.state.doc.toString();
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        closeBrackets(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        livePreview({ untilFocused: true }),
        editorTheme,
        Prec.high(fieldTheme(rows, maxRows)),
        placeholder ? placeholderExt(placeholder) : [],
        EditorView.contentAttributes.of({
          "aria-label": label,
          "aria-multiline": singleLine ? "false" : "true",
          spellcheck: "true",
        }),
        singleLine
          ? EditorState.transactionFilter.of((tr) =>
              tr.docChanged && tr.newDoc.lines > 1 && !tr.isUserEvent("input.paste") ? [] : tr,
            )
          : [],
        Prec.highest(
          keymap.of([
            {
              key: "Enter",
              run: (v) => {
                if (props.current.submitKey !== "enter") return false;
                props.current.onSubmit?.(text(v));
                return true;
              },
              // One line only: Shift+Enter does nothing, instead of a new line.
              shift: () => singleLine,
            },
            {
              key: "Mod-Enter",
              run: (v) => {
                if (props.current.submitKey !== "mod-enter") return false;
                props.current.onSubmit?.(text(v));
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                if (!props.current.onEscape) return false;
                props.current.onEscape();
                return true;
              },
            },
          ]),
        ),
        listIndent,
        keymap.of([
          { key: "Mod-b", run: (v) => toggleWrap(v, "**") },
          { key: "Mod-i", run: (v) => toggleWrap(v, "_") },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) props.current.onChange?.(text(u.view));
        }),
        EditorView.domEventHandlers({
          blur: (_e, v) => {
            props.current.onBlur?.(text(v));
          },
        }),
      ],
    });
    const v = new EditorView({ state, parent });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // The box is made once; what changes later is read through `props` and the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value that comes from outside (another note was opened, the text was saved and cleared).
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    />
  );
}
