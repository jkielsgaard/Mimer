import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Code2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortcut } from "@/lib/shortcuts";
import {
  InlineAiPopup,
  type InlineSelection,
  type InlineStart,
} from "@/features/inlineAi/InlineAiPopup";
import { EditorContextMenu } from "./EditorContextMenu";
import { SelectionBubble } from "./SelectionBubble";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { askAi } from "@/lib/askAi";
import { SpellPopover } from "./SpellPopover";
import {
  clearSpelling,
  parseFixes,
  spellField,
  type SpellingConfig,
  type SpellMark,
} from "./extensions/aiSpelling";
import { api } from "@/lib/api";
import { planTitleRename } from "@/lib/noteTitle";
import { useIdeaStore } from "@/stores/ideaStore";
import { useTaskStore } from "@/stores/taskStore";
import { useTagStore } from "@/stores/tagStore";
import { useTitleFollow } from "@/stores/titleFollowStore";
import { assetUrlFor, openHref, openWikiLink, searchForTag } from "@/lib/actions";
import { newNoteInCurrentFolder } from "@/lib/actions";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";
import type { PreviewConfig } from "./extensions/previewConfig";
import { insertNoteLink } from "./extensions/formatCommands";
import { insertImagesFromDialog } from "./insertImages";
import { EditorToolbar } from "./EditorToolbar";
import { StartMeetingButton } from "@/features/meetings/StartMeetingButton";
import { NoteAiMenu } from "./NoteAiMenu";
import { LinkNoteDialog } from "./LinkNoteDialog";
import { TitleFollowChip } from "./TitleFollowChip";
import { useNoteSession } from "./useNoteSession";
import { InfoHint } from "@/components/InfoHint";

const NO_WORDS: string[] = [];

/** What the spelling help asks the local AI about one paragraph. */
const SPELL_INSTRUCTION =
  "Find the misspelt words in the text. The text can be in any language, for example Danish, English or German: check each word against the spelling of the language of the text, never against English. Answer with one line per misspelt word, written as: wrong => right. Only real spelling mistakes: leave out names, product names, code, links, tags and words that are spelt right. Do not correct grammar or style. If there are none, answer exactly NONE.";

/** How long after a save a new note is renamed to match its title (milliseconds). */
export const TITLE_RENAME_DELAY_MS = 1500;

/**
 * The CodeMirror live-preview editor of one pane. The pane shows the active tab of the workspace;
 * the note's lifecycle (loading, saving, tab switching, disk changes) lives in `useNoteSession`.
 */
export function Editor({ paneId }: { paneId: PaneId }) {
  const host = useRef<HTMLDivElement>(null);
  const [inline, setInline] = useState<InlineSelection | null>(null);
  const [inlineStart, setInlineStart] = useState<InlineStart | undefined>(undefined);
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  /** Where the text menu (right-click on selected text) is shown. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const activePath = useWorkspaceStore(
    (s) => s.layout.panes.find((p) => p.id === paneId)?.active ?? null,
  );
  const resolver = useVaultStore((s) => s.resolver);
  const spellcheck = useSettingsStore((s) => s.settings?.editor.spellcheck ?? true);
  const conflict = useEditorStore((s) => s.conflicts[paneId]);
  const sourceMode = useUiStore((s) => s.sourceMode);
  const aiOff = useAiBlocked();
  const indexNonce = useVaultStore((s) => s.indexNonce);
  useEffect(() => {
    void useTagStore.getState().load();
  }, [indexNonce]);
  const aiSpellingOn = useSettingsStore((s) => s.settings?.editor.aiSpelling ?? false);
  const ownWords = useSettingsStore((s) => s.settings?.editor.ownWords) ?? NO_WORDS;
  const [spell, setSpell] = useState<{ mark: SpellMark; x: number; y: number } | null>(null);
  const spelling = useRef<SpellingConfig>({
    enabled: false,
    check: () => Promise.resolve([]),
    ownWords: [],
    onPick: () => undefined,
  });
  spelling.current = {
    enabled: aiSpellingOn && aiOff === null && activePath !== null,
    check: (text) => askAi(SPELL_INSTRUCTION, text, activePath).promise.then(parseFixes),
    ownWords,
    onPick: (mark, x, y) => {
      setSpell({ mark, x, y });
    },
  };

  const previewCfg = useMemo<PreviewConfig>(
    () => ({
      notePath: activePath ?? "",
      resolveLink: (t) => resolver.resolve(t),
      assetUrl: assetUrlFor,
      fileExists: (p) => resolver.has(p),
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
    setInlineStart(undefined);
    setInline({
      from: sel.from,
      to: sel.to,
      text: view.state.sliceDoc(sel.from, sel.to),
      x: x ?? coords?.left ?? 100,
      y: y ?? coords?.bottom ?? 100,
    });
  }, []);

  const openMenu = useCallback((_view: EditorView, x: number, y: number): void => {
    setMenu({ x, y });
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
    onContext: openMenu,
    onLinkPicker: openLinkPicker,
    onSaved: followTitle,
    spelling: () => spelling.current,
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

  /** Writes the selected text down as a task (in this note's epic task) or as an idea. */
  const capture = (kind: "task" | "idea"): void => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const text = view.state.sliceDoc(sel.from, sel.to).replace(/\s+/g, " ").trim().slice(0, 300);
    if (text === "") return;
    const ui = useUiStore.getState();
    if (kind === "task") {
      const note = activePath;
      if (note === null) return;
      // The task goes into the epic task of this note (made now if the note has none).
      void useTaskStore
        .getState()
        .epicFor(note)
        .then((epic) => {
          if (epic !== null) void useTaskStore.getState().add(text, undefined, undefined, epic);
        });
      ui.toast("Added as a task in the epic task of this note.", "success");
    } else {
      void useIdeaStore.getState().add(text);
      ui.toast("Written down as an idea.", "success");
    }
  };

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
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-base">No note open</p>
            <p className="text-xs">
              Pick a note in the file tree, or press Ctrl/Cmd+N to create one.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="pointer-events-auto"
              onClick={newNoteInCurrentFolder}
            >
              New note
            </Button>
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
            <StartMeetingButton path={activePath} />
            <NoteAiMenu path={activePath} />
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
      <SelectionBubble
        host={host}
        viewRef={viewRef}
        hidden={inline !== null || activePath === null}
        aiOff={aiOff}
        onCapture={capture}
        onChoose={(start) => {
          const view = viewRef.current;
          if (!view) return;
          openInline(view);
          setInlineStart(start);
        }}
      />
      {menu !== null && viewRef.current !== null && (
        <EditorContextMenu
          at={menu}
          view={viewRef.current}
          aiOff={aiOff}
          onAi={() => {
            const view = viewRef.current;
            if (view) openInline(view, menu.x, menu.y);
          }}
          onCapture={capture}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
      {spell && (
        <SpellPopover
          mark={spell.mark}
          x={spell.x}
          y={spell.y}
          others={viewRef.current?.state.field(spellField, false)?.length ?? 0}
          onClose={() => {
            setSpell(null);
          }}
          onReplace={() => {
            const view = viewRef.current;
            const m = spell.mark;
            setSpell(null);
            if (view && view.state.sliceDoc(m.from, m.to) === m.wrong) {
              view.dispatch({ changes: { from: m.from, to: m.to, insert: m.right } });
            }
            view?.focus();
          }}
          onIgnore={() => {
            const view = viewRef.current;
            const m = spell.mark;
            setSpell(null);
            if (view) clearSpelling(view, (x) => x.from === m.from && x.to === m.to);
          }}
          onAddWord={() => {
            const view = viewRef.current;
            const word = spell.mark.wrong;
            setSpell(null);
            if (view) clearSpelling(view, (x) => x.wrong.toLowerCase() === word.toLowerCase());
            const settings = useSettingsStore.getState().settings;
            if (settings && !settings.editor.ownWords.includes(word)) {
              void useSettingsStore
                .getState()
                .save({
                  ...settings,
                  editor: { ...settings.editor, ownWords: [...settings.editor.ownWords, word] },
                })
                .catch(reportError);
            }
          }}
          onFixAll={() => {
            const view = viewRef.current;
            setSpell(null);
            if (!view) return;
            const marks = [...view.state.field(spellField)]
              .filter((m) => view.state.sliceDoc(m.from, m.to) === m.wrong)
              .sort((a, b) => a.from - b.from);
            view.dispatch({
              changes: marks.map((m) => ({ from: m.from, to: m.to, insert: m.right })),
            });
            view.focus();
          }}
        />
      )}
      {inline && activePath !== null && (
        <InlineAiPopup
          selection={inline}
          start={inlineStart}
          notePath={activePath}
          aiOff={aiOff}
          onFindTasks={(text) => {
            setInline(null);
            useUiStore.getState().setFindTasksOpen(true, text);
          }}
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
