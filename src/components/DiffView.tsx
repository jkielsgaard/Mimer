import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

interface Props {
  original: string;
  modified: string;
  className?: string;
}

const diffTheme = EditorView.theme({
  "&": { backgroundColor: "var(--card)", color: "var(--foreground)", fontSize: "12.5px" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  ".cm-changedLine": { backgroundColor: "color-mix(in oklab, var(--success) 14%, transparent)" },
  ".cm-deletedChunk": {
    backgroundColor: "color-mix(in oklab, var(--destructive) 14%, transparent)",
  },
  ".cm-deletedChunk .cm-deletedText, .cm-deletedText": {
    backgroundColor: "color-mix(in oklab, var(--destructive) 30%, transparent)",
  },
  ".cm-insertedLine, .cm-changedText": {
    backgroundColor: "color-mix(in oklab, var(--success) 30%, transparent)",
  },
});

/** Read-only unified diff (old → new) using CodeMirror's merge view. */
export function DiffView({ original, modified, className }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: modified,
        extensions: [
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          diffTheme,
          unifiedMergeView({
            original,
            mergeControls: false,
            gutter: false,
            highlightChanges: true,
          }),
        ],
      }),
    });
    return () => {
      view.destroy();
    };
  }, [original, modified]);

  return <div ref={host} className={className} data-testid="diff-view" />;
}
