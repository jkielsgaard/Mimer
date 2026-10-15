import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Code2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortcut } from "@/lib/shortcuts";
import { InlineAiPopup, type InlineSelection } from "@/features/inlineAi/InlineAiPopup";
import { api } from "@/lib/api";
import { planTitleRename } from "@/lib/noteTitle";
import { useTitleFollow } from "@/stores/titleFollowStore";
import { assetUrlFor, openHref, openWikiLink, searchForTag } from "@/lib/actions";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";
import type { PreviewConfig } from "./extensions/previewConfig";
import { insertNoteLink } from "./extensions/formatCommands";
import { insertImagesFromDialog } from "./insertImages";
import { EditorToolbar } from "./EditorToolbar";
import { LinkNoteDialog } from "./LinkNoteDialog";
import { TitleFollowChip } from "./TitleFollowChip";
import { useNoteSession } from "./useNoteSession";
import { InfoHint } from "@/components/InfoHint";

/** How long after a save a new note is renamed to match its title (milliseconds). */
export const TITLE_RENAME_DELAY_MS = 1500;

/**
 * The CodeMirror live-preview editor of one pane. The pane shows the active tab of the workspace;
 * the note's lifecycle (loading, saving, tab switching, disk changes) lives in `useNoteSession`.
 */
export function Editor({ paneId }: { paneId: PaneId }) {
  const host = useRef<HTMLDivElement>(null);
  const [inline, setInline] = useState<InlineSelection | null>(null);
  const [linkQuery, setLinkQuery] = useState<string | null>(null);

  const activePath = useWorkspaceStore(
    (s) => s.layout.panes.find((p) => p.id === paneId)?.active ?? null,
  );
  const resolver = useVaultStore((s) => s.resolver);
  const spellcheck = useSettingsStore((s) => s.settings?.editor.spellcheck ?? true);
  const conflict = useEditorStore((s) => s.conflicts[paneId]);
  const sourceMode = useUiStore((s) => s.sourceMode);

  const previewCfg = useMemo<PreviewConfig>(
    () => ({
      notePath: activePath ?? "",
      resolveLink: (t) => resolver.resolve(t),
      assetUrl: assetUrlFor,
      openWikiLink: (t, r) => {
        void openWikiLink(t, r);
      },
      openTag: searchForTag,
      openHref: (h, n) => {
        void openHref(h, n);
      },
    }),
    [activePath, resolver],
  );

  /** Shows the inline AI popup at the selection, or at the given screen position. */
  const openInline = useCallback((view: EditorView, x?: number, y?: number): void => {
    const sel = view.state.selection.main;
    if (sel.empty) {
      useUiStore.getState().toast("Select some text first, then press the shortcut again.");
      return;
    }
    const coords = view.coordsAtPos(sel.from);
    setInline({
      from: sel.from,
      to: sel.to,
      text: view.state.sliceDoc(sel.from, sel.to),
      x: x ?? coords?.left ?? 100,
      y: y ?? coords?.bottom ?? 100,
    });
  }, []);

  const viewRefHolder = useRef<RefObject<EditorView | null> | null>(null);
  /** Opens the note picker, pre-filled with a one-line selection. */
  const openLinkPicker = useCallback(() => {
    const view = viewRefHolder.current?.current ?? null;
    const selected = view
      ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
      : "";
    setLinkQuery(selected.includes("\n") ? "" : selected.trim().slice(0, 60));
  }, []);

  // A new note is named after its first heading: a moment after the text was saved.
  const sessionRef = useRef<{ current: { path: string | null; dirty: boolean } } | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followTitle = useCallback((path: string, content: string) => {
    if (renameTimer.current) clearTimeout(renameTimer.current);
    if (!useTitleFollow.getState().has(path)) return;
    renameTimer.current = setTimeout(() => {
      const live = sessionRef.current?.current;
      // Typing since the save: the next save plans the rename again.
      if (!live || live.path !== path || live.dirty) return;
      if (!useTitleFollow.getState().has(path)) return;
      const target = planTitleRename(path, content, useVaultStore.getState().files);
      if (target !== null) void useVaultStore.getState().renameNewNote(path, target);
    }, TITLE_RENAME_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (renameTimer.current) clearTimeout(renameTimer.current);
    },
    [],
  );

  const { viewRef, session, save, keepMine, loadDisk } = useNoteSession({
    paneId,
    host,
    previewCfg,
    spellcheck,
    sourceMode,
    onInline: openInline,
    onLinkPicker: openLinkPicker,
    onSaved: followTitle,
  });
  sessionRef.current = session;
  viewRefHolder.current = viewRef;

  const acceptInline = useCallback(
    async (replacement: string, label: string) => {
      const view = viewRef.current;
      const sel = inline;
      const path = session.current.path;
      if (!view || !sel || path === null) return;
      setInline(null);
      if (view.state.sliceDoc(sel.from, sel.to) !== sel.text) {
        useUiStore
          .getState()
          .toast("The selected text changed; the AI result was not applied.", "error");
        return;
      }
      try {
        await save();
        await api.commitNow({ kind: "snapshotBeforeAi", detail: `${label} in ${path}` }, [path]);
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: replacement } });
        await save();
        await api.commitNow({ kind: "ai", detail: `${label} in ${path}` }, [path]);
        view.focus();
      } catch (e) {
        reportError(e);
      }
    },
    [inline, save, session, viewRef],
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onFocusCapture={() => {
        useWorkspaceStore.getState().focusPane(paneId);
      }}
      onMouseDownCapture={() => {
        useWorkspaceStore.getState().focusPane(paneId);
      }}
    >
      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b bg-warning/20 px-3 py-2 text-sm"
        >
          <span className="flex-1">This note changed on disk.</span>
          <Button size="sm" variant="outline" onClick={() => void keepMine()}>
            Keep my version
          </Button>
          <Button size="sm" onClick={() => void loadDisk()}>
            Load disk version
          </Button>
        </div>
      )}
      {activePath === null && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-base">No note open</p>
            <p className="text-xs">
              Pick a note in the file tree, or press Ctrl/Cmd+N to create one.
            </p>
          </div>
        </div>
      )}
      <EditorToolbar
        viewRef={viewRef}
        disabled={activePath === null}
        onPickLink={openLinkPicker}
        onInsertImage={() => {
          const view = viewRef.current;
          const path = session.current.path;
          if (view && path !== null) void insertImagesFromDialog(view, path);
        }}
        trailing={
          <span className="ml-auto flex items-center gap-1">
            <TitleFollowChip path={activePath} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={sourceMode ? "Show live preview" : "Show Markdown source"}
              aria-pressed={sourceMode}
              title={`${sourceMode ? "Show live preview" : "Show Markdown source"} (${formatShortcut("Mod+Alt+M")})`}
              onClick={() => {
                useUiStore.getState().setSourceMode(!sourceMode);
              }}
            >
              {sourceMode ? <Eye /> : <Code2 />}
            </Button>
            <InfoHint
              label="Writing notes"
              text="The buttons add the Markdown for you: select text and click, or click and type. Pause on a button to see its name and shortcut."
              topic="writing"
            />
          </span>
        }
      />
      <LinkNoteDialog
        open={linkQuery !== null}
        initialQuery={linkQuery ?? ""}
        onPick={(target) => {
          const view = viewRef.current;
          if (view) insertNoteLink(view, target);
        }}
        onClose={() => {
          setLinkQuery(null);
          viewRef.current?.focus();
        }}
      />
      <div ref={host} className="min-h-0 flex-1" data-testid={`editor-${paneId}`} />
      {inline && activePath !== null && (
        <InlineAiPopup
          selection={inline}
          notePath={activePath}
          onAccept={(r, l) => void acceptInline(r, l)}
          onClose={() => {
            setInline(null);
            viewRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
