import type { EditorView } from "@codemirror/view";
import {
  Bold,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table,
  Code,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { formatShortcut } from "@/lib/shortcuts";
import { insertTable, toggleWrap } from "./extensions/commands";
import {
  insertCodeBlock,
  insertLink,
  insertRule,
  insertWikiLink,
  setHeading,
  toggleBlock,
} from "./extensions/formatCommands";

interface Tool {
  id: string;
  label: string;
  /** Shown in the tooltip, for example "Mod+B". */
  shortcut?: string;
  icon: LucideIcon;
  run: (view: EditorView) => boolean;
}

/** Formatting tools in groups; a thin divider is drawn between groups. */
const GROUPS: Tool[][] = [
  [
    { id: "bold", label: "Bold", shortcut: "Mod+B", icon: Bold, run: (v) => toggleWrap(v, "**") },
    {
      id: "italic",
      label: "Italic",
      shortcut: "Mod+I",
      icon: Italic,
      run: (v) => toggleWrap(v, "_"),
    },
    { id: "strike", label: "Strikethrough", icon: Strikethrough, run: (v) => toggleWrap(v, "~~") },
    { id: "code", label: "Inline code", icon: Code, run: (v) => toggleWrap(v, "`") },
  ],
  [
    { id: "h1", label: "Heading 1", icon: Heading1, run: (v) => setHeading(v, 1) },
    { id: "h2", label: "Heading 2", icon: Heading2, run: (v) => setHeading(v, 2) },
    { id: "h3", label: "Heading 3", icon: Heading3, run: (v) => setHeading(v, 3) },
  ],
  [
    { id: "bullet", label: "Bullet list", icon: List, run: (v) => toggleBlock(v, "bullet") },
    {
      id: "number",
      label: "Numbered list",
      icon: ListOrdered,
      run: (v) => toggleBlock(v, "number"),
    },
    { id: "task", label: "Task list", icon: ListChecks, run: (v) => toggleBlock(v, "task") },
    { id: "quote", label: "Quote", icon: Quote, run: (v) => toggleBlock(v, "quote") },
  ],
  [
    { id: "link", label: "Link", icon: Link, run: insertLink },
    {
      id: "wiki",
      label: "Link to a note",
      shortcut: "Mod+Shift+K",
      icon: Link2,
      run: insertWikiLink,
    },
  ],
  [
    {
      id: "table",
      label: "Insert table",
      shortcut: "Mod+Alt+T",
      icon: Table,
      run: (v) => insertTable(v),
    },
    { id: "image", label: "Insert image", icon: ImagePlus, run: () => true },
    { id: "codeblock", label: "Code block", icon: FileCode, run: insertCodeBlock },
    { id: "rule", label: "Horizontal line", icon: Minus, run: insertRule },
  ],
];

interface Props {
  /** The editor the tools act on. */
  viewRef: RefObject<EditorView | null>;
  /** True while the pane has no note open. */
  disabled: boolean;
  /** Opens the note picker for "Link to a note"; without it the button only inserts `[[]]`. */
  onPickLink?: () => void;
  /** Lets the user choose pictures to put in the note. */
  onInsertImage?: () => void;
  /** Shown at the right end of the toolbar. */
  trailing?: ReactNode;
}

/** Formatting toolbar above the editor: one click inserts Markdown, so syntax need not be typed. */
export function EditorToolbar({ viewRef, disabled, onPickLink, onInsertImage, trailing }: Props) {
  const run = (tool: Tool): void => {
    const view = viewRef.current;
    if (!view || disabled) return;
    if (tool.id === "image") {
      onInsertImage?.();
      return;
    }
    if (tool.id === "wiki" && onPickLink) {
      onPickLink();
      return;
    }
    tool.run(view);
    view.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b bg-sidebar px-2 py-1"
      // Keep the selection and focus in the editor when a tool is clicked.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
          {group.map((tool) => {
            const title = tool.shortcut
              ? `${tool.label} (${formatShortcut(tool.shortcut)})`
              : tool.label;
            return (
              <Button
                key={tool.id}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={tool.label}
                title={title}
                disabled={disabled}
                onClick={() => {
                  run(tool);
                }}
              >
                <tool.icon />
              </Button>
            );
          })}
        </div>
      ))}
      {trailing}
    </div>
  );
}
